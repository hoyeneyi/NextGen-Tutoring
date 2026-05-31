/**
 * nextgen-calendar-worker.js
 * Cloudflare Worker — Google Calendar integration for NextGen Tutoring.
 * Deploy to: nextgen-calendar-worker.nextgentutoringco.workers.dev
 *
 * Required secrets (set via `wrangler secret put`):
 *   GOOGLE_SERVICE_ACCOUNT_KEY  — full JSON string of the service account key file
 *   CALENDAR_ID                 — calendar to read/write (e.g. hoyeneyi@umich.edu)
 *
 * Routes:
 *   POST /create-event         — creates an event in Google Calendar
 *   POST /check-availability   — checks if a time window is free
 *   GET  /events?date=YYYY-MM-DD — returns events for a given date
 */

const ALLOWED_ORIGINS = [
  'https://nextgentutoring.org',
  'https://www.nextgentutoring.org',
  'http://localhost',
  'http://localhost:3000',
  'http://127.0.0.1',
];

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE     = 'https://www.googleapis.com/auth/calendar';

// ── CORS ─────────────────────────────────────────────────────────────────────

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age':       '86400',
  };
}

// ── BASE64URL ─────────────────────────────────────────────────────────────────

function base64url(buffer) {
  let str = '';
  const bytes = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlEncode(str) {
  return base64url(new TextEncoder().encode(str));
}

// ── GOOGLE OAUTH2 — SERVICE ACCOUNT JWT ───────────────────────────────────────

async function getAccessToken(serviceAccountKey) {
  const now = Math.floor(Date.now() / 1000);

  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss:   serviceAccountKey.client_email,
    scope: SCOPE,
    aud:   TOKEN_URL,
    iat:   now,
    exp:   now + 3600,
  };

  const sigInput = `${base64urlEncode(JSON.stringify(header))}.${base64urlEncode(JSON.stringify(payload))}`;

  // Import the PKCS#8 private key from the PEM string
  const pemBody = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const keyBytes = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(sigInput)
  );

  const jwt = `${sigInput}.${base64url(signatureBuffer)}`;

  // Exchange JWT for OAuth2 access token
  const tokenRes = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const msg = await tokenRes.text();
    throw new Error(`Token exchange failed (${tokenRes.status}): ${msg}`);
  }

  const { access_token } = await tokenRes.json();
  return access_token;
}

// ── DST-AWARE EASTERN TIME OFFSET ─────────────────────────────────────────────
// Returns '-04:00' (EDT) or '-05:00' (EST) for a given date string (YYYY-MM-DD).

function easternOffset(dateStr) {
  const d    = new Date(dateStr + 'T12:00:00Z');
  const year = d.getUTCFullYear();

  // DST start: 2nd Sunday of March at 02:00 local
  const mar1   = new Date(Date.UTC(year, 2, 1));
  const dstStart = new Date(Date.UTC(year, 2, 8 + (7 - mar1.getUTCDay()) % 7));

  // DST end: 1st Sunday of November at 02:00 local
  const nov1   = new Date(Date.UTC(year, 10, 1));
  const dstEnd = new Date(Date.UTC(year, 10, 1 + (7 - nov1.getUTCDay()) % 7));

  return (d >= dstStart && d < dstEnd) ? '-04:00' : '-05:00';
}

// ── ROUTE HANDLERS ────────────────────────────────────────────────────────────

async function handleCreateEvent(request, env) {
  const { summary, description, startDateTime, endDateTime, location } = await request.json();
  if (!summary || !startDateTime || !endDateTime) {
    return { error: 'summary, startDateTime, and endDateTime are required' };
  }

  const saKey     = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const token     = await getAccessToken(saKey);
  const calId     = env.CALENDAR_ID;

  const event = {
    summary,
    description: description || '',
    location:    location    || 'NextGen Tutoring — Metro Detroit / Virtual',
    start: { dateTime: startDateTime, timeZone: 'America/Detroit' },
    end:   { dateTime: endDateTime,   timeZone: 'America/Detroit' },
    reminders: { useDefault: true },
  };

  const res = await fetch(
    `${GCAL_BASE}/calendars/${encodeURIComponent(calId)}/events`,
    {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(event),
    }
  );

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Google Calendar create failed (${res.status}): ${msg}`);
  }

  const created = await res.json();
  return { success: true, eventId: created.id, htmlLink: created.htmlLink };
}

async function handleCheckAvailability(request, env) {
  const { startDateTime, endDateTime } = await request.json();
  if (!startDateTime || !endDateTime) {
    return { error: 'startDateTime and endDateTime are required' };
  }

  const saKey = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const token = await getAccessToken(saKey);
  const calId = env.CALENDAR_ID;

  const url = new URL(`${GCAL_BASE}/calendars/${encodeURIComponent(calId)}/events`);
  url.searchParams.set('timeMin',      startDateTime);
  url.searchParams.set('timeMax',      endDateTime);
  url.searchParams.set('singleEvents', 'true');

  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Google Calendar list failed (${res.status}): ${msg}`);
  }

  const data      = await res.json();
  const conflicts = (data.items || []).map(e => ({
    summary: e.summary || 'Busy',
    start:   e.start.dateTime || e.start.date,
    end:     e.end.dateTime   || e.end.date,
  }));

  return { available: conflicts.length === 0, conflicts };
}

async function handleGetEvents(request, env) {
  const url    = new URL(request.url);
  const date   = url.searchParams.get('date'); // YYYY-MM-DD
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: 'Missing or invalid date parameter (expected YYYY-MM-DD)' };
  }

  const saKey  = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const token  = await getAccessToken(saKey);
  const calId  = env.CALENDAR_ID;
  const offset = easternOffset(date);

  // Query the full calendar day in Eastern time
  const timeMin = `${date}T00:00:00${offset}`;
  const timeMax = `${date}T23:59:59${offset}`;

  const apiUrl = new URL(`${GCAL_BASE}/calendars/${encodeURIComponent(calId)}/events`);
  apiUrl.searchParams.set('timeMin',      timeMin);
  apiUrl.searchParams.set('timeMax',      timeMax);
  apiUrl.searchParams.set('singleEvents', 'true');
  apiUrl.searchParams.set('orderBy',      'startTime');
  apiUrl.searchParams.set('fields',       'items(id,summary,start,end)');

  const res = await fetch(apiUrl.toString(), {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Google Calendar list failed (${res.status}): ${msg}`);
  }

  const data   = await res.json();
  const events = (data.items || []).map(e => ({
    summary: e.summary || 'Busy',
    start:   e.start.dateTime || e.start.date,
    end:     e.end.dateTime   || e.end.date,
  }));

  return { events };
}

// ── MAIN FETCH HANDLER ────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin  = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    const { pathname } = new URL(request.url);

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

    try {
      if (request.method === 'POST' && pathname === '/create-event') {
        return json(await handleCreateEvent(request, env));
      }
      if (request.method === 'POST' && pathname === '/check-availability') {
        return json(await handleCheckAvailability(request, env));
      }
      if (request.method === 'GET' && pathname === '/events') {
        return json(await handleGetEvents(request, env));
      }
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error('[calendar-worker]', err.message);
      return json({ error: err.message }, 500);
    }
  },
};
