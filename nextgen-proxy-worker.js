/**
 * NextGen Tutoring — Cloudflare Worker Proxy
 * Worker Name: nextgen-proxy
 * Worker URL:  nextgen-proxy.nextgentutoringco.workers.dev
 *
 * Purpose:
 *   Sits between the browser and the Anthropic API.
 *   Keeps the API key out of the browser entirely.
 *   Used by: dashboard.html (AI Practice) and admin.html (Session Architect)
 *
 * Secret required:
 *   ANTHROPIC_API_KEY — set in Cloudflare Workers → Settings → Variables and Secrets
 */

const ALLOWED_ORIGINS = [
  'https://nextgentutoring.org',
  'https://www.nextgentutoring.org',
  'http://localhost',
  'http://127.0.0.1',
];

export default {
  async fetch(request, env) {

    const origin = request.headers.get('Origin') || '';

    // ── CORS PREFLIGHT ──
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, origin);
    }

    // ── METHOD GUARD ──
    if (request.method !== 'POST') {
      return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405, origin);
    }

    // ── ORIGIN GUARD ──
    // Allow requests with no origin (e.g. direct curl / Cloudflare preview)
    // and block anything from an unlisted origin
    if (origin && !ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
      return corsResponse(JSON.stringify({ error: 'Origin not allowed' }), 403, origin);
    }

    // ── API KEY GUARD ──
    if (!env.ANTHROPIC_API_KEY) {
      return corsResponse(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY secret not configured in Worker settings.' }),
        500, origin
      );
    }

    // ── PARSE BODY ──
    let body;
    try {
      body = await request.json();
    } catch {
      return corsResponse(JSON.stringify({ error: 'Invalid JSON body' }), 400, origin);
    }

    // ── FORWARD TO ANTHROPIC ──
    try {
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      const data = await anthropicRes.json();

      return corsResponse(JSON.stringify(data), anthropicRes.status, origin);

    } catch (err) {
      return corsResponse(
        JSON.stringify({ error: 'Failed to reach Anthropic API', detail: err.message }),
        502, origin
      );
    }
  }
};

// ── HELPER: build response with CORS headers ──
function corsResponse(body, status, origin) {
  const allowedOrigin = ALLOWED_ORIGINS.some(o => origin.startsWith(o))
    ? origin
    : ALLOWED_ORIGINS[0];

  const headers = {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type':                 'application/json',
  };

  return new Response(body, { status: status || 200, headers });
}
