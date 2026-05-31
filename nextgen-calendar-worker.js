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
 *   POST /create-event           — creates an event in Google Calendar
 *   POST /check-availability     — checks if a time window is free
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

// ── CORS ──────────────────────────────────────────────────────────────────────

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

// ── GOOGLE OAUTH2 — SERVICE ACCOUNT JWT ──────────────────────────────────────

async function getAccessToken(serviceAccountKey) {
  const now = Math.floor(Date.now() / 1000);

  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss:   serviceAccountKey.client_email,
    scope: SCOPE,
    aud:   TOKEN_URL,   // must be exactly the token endpoint URL
    iat:   now,
    exp:   now + 3600,
  };

  const sigInput = `${base64urlEncode(JSON.stringify(header))}.${base64urlEncode(JSON.stringify(payload))}`;

  // Import the PKCS#8 private key from the service account PEM string
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

  // Exchange signed JWT for an OAuth2 access token
  const tokenRes = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const raw = await tokenRes.text();
    console.error('[calendar-worker] token exchange failed', tokenRes.status, raw);
    throw new Error(`Token exchange failed (${tokenRes.status}): ${raw}`);
  }

  const { access_token } = await tokenRes.json();
  return access_token;
}

// ── HELPER: call Google Calendar API and surface errors clearly ───────────────

async function gcalFetch(url, options = {}) {
  console.log('[calendar-worker] gcalFetch →', url.toString ? url.toString() : url);

  const res = await fetch(url, options);

  if (!res.ok) {
    const rawText = await res.text();
    let parsedError;
    try { parsedError = JSON.parse(rawText); }
    catch (_) { parsedError = { raw: rawText }; }

    console.error('[calendar-worker] Google API error', {
      status:  res.status,
      url:     url.toString ? url.toString() : url,
      body:    parsedError,
    });

    // Throw an error that carries the full Google error payload
    const err = new Error(`Google Calendar API error (${res.status})`);
    err.status      = res.status;
    err.googleError = parsedError;
    throw err;
  }

  return res.json();
}

// ── DST-AWARE EASTERN TIME OFFSET ─────────────────────────────────────────────

function easternOffset(dateStr) {
  const d    = new Date(dateStr + 'T12:00:00Z');
  const year = d.getUTCFullYear();

  // DST start: 2nd Sunday of March
  const mar1     = new Date(Date.UTC(year, 2, 1));
  const dstStart = new Date(Date.UTC(year, 2, 8 + (7 - mar1.getUTCDay()) % 7));

  // DST end: 1st Sunday of November
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

  const saKey = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const token = await getAccessToken(saKey);
  // Trim whitespace/newlines that can sneak in when setting secrets
  const calId = (env.CALENDAR_ID || '').trim();

  console.log('[calendar-worker] create-event calId:', calId);

  const event = {
    summary,
    description: description || '',
    location:    location    || 'NextGen Tutoring — Metro Detroit / Virtual',
    start: { dateTime: startDateTime, timeZone: 'America/Detroit' },
    end:   { dateTime: endDateTime,   timeZone: 'America/Detroit' },
    reminders: { useDefault: true },
  };

  const url = `${GCAL_BASE}/calendars/${encodeURIComponent(calId)}/events`;
  console.log('[calendar-worker] create-event URL:', url);

  const created = await gcalFetch(url, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(event),
  });

  return { success: true, eventId: created.id, htmlLink: created.htmlLink };
}

async function handleCheckAvailability(request, env) {
  const { startDateTime, endDateTime } = await request.json();
  if (!startDateTime || !endDateTime) {
    return { error: 'startDateTime and endDateTime are required' };
  }

  const saKey = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const token = await getAccessToken(saKey);
  const calId = (env.CALENDAR_ID || '').trim();

  console.log('[calendar-worker] check-availability calId:', calId);

  const apiUrl = new URL(`${GCAL_BASE}/calendars/${encodeURIComponent(calId)}/events`);
  apiUrl.searchParams.set('timeMin',      startDateTime);
  apiUrl.searchParams.set('timeMax',      endDateTime);
  apiUrl.searchParams.set('singleEvents', 'true');

  console.log('[calendar-worker] check-availability URL:', apiUrl.toString());

  const data      = await gcalFetch(apiUrl.toString(), {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const conflicts = (data.items || []).map(e => ({
    summary: e.summary || 'Busy',
    start:   e.start.dateTime || e.start.date,
    end:     e.end.dateTime   || e.end.date,
  }));

  return { available: conflicts.length === 0, conflicts };
}

async function handleGetEvents(request, env) {
  const reqUrl = new URL(request.url);
  const date   = reqUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: 'Missing or invalid date parameter (expected YYYY-MM-DD)' };
  }

  const saKey  = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const token  = await getAccessToken(saKey);
  // Trim whitespace/newlines — the most common cause of 404 from pasted secrets
  const calId  = (env.CALENDAR_ID || '').trim();
  const offset = easternOffset(date);

  console.log('[calendar-worker] get-events calId repr:', JSON.stringify(calId));
  console.log('[calendar-worker] get-events calId encoded:', encodeURIComponent(calId));

  const timeMin = `${date}T00:00:00${offset}`;
  const timeMax = `${date}T23:59:59${offset}`;

  const apiUrl = new URL(`${GCAL_BASE}/calendars/${encodeURIComponent(calId)}/events`);
  apiUrl.searchParams.set('timeMin',      timeMin);
  apiUrl.searchParams.set('timeMax',      timeMax);
  apiUrl.searchParams.set('singleEvents', 'true');
  apiUrl.searchParams.set('orderBy',      'startTime');
  apiUrl.searchParams.set('fields',       'items(id,summary,start,end)');

  console.log('[calendar-worker] get-events full URL:', apiUrl.toString());

  const data   = await gcalFetch(apiUrl.toString(), {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const events = (data.items || []).map(e => ({
    summary: e.summary || 'Busy',
    start:   e.start.dateTime || e.start.date,
    end:     e.end.dateTime   || e.end.date,
  }));

  return { events, _debug: { calId, date, timeMin, timeMax } };
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
      console.error('[calendar-worker] unhandled error:', err.message, err.googleError || '');
      // Surface the full Google API error body in the response for debugging
      return json({
        error:       err.message,
        googleError: err.googleError || null,
      }, err.status || 500);
    }
  },
};
