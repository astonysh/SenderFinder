// Receives the optional daily usage summary from the extension (see extension/core/telemetry.js) and
// stores it in a D1 (SQLite) table, one row per (install, day). This is the whole server side.
//
// Deliberately not done here: no IP logging, no cookies, no user agent storage, no per-request analytics.
// Cloudflare's own request logs are disabled for this Worker in wrangler.toml (observability.enabled = false).

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[0-9a-f-]{32,36}$/i;
const STEP = /^[a-z0-9_]{1,32}$/;
const SOURCE = /^(gmail|outlook|options|popup|other)$/;
const MAX_COUNT = 100000;

const count = (v, max = MAX_COUNT) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);

// Validates the posted document. Returns { ok:true, row } or { ok:false, error }.
export function parseDaily(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'not_an_object' };
  if (body.v !== 1) return { ok: false, error: 'unsupported_version' };
  if (typeof body.install !== 'string' || !ID.test(body.install)) return { ok: false, error: 'bad_install' };
  if (typeof body.day !== 'string' || !DAY.test(body.day) || Number.isNaN(Date.parse(body.day + 'T00:00:00Z'))) return { ok: false, error: 'bad_day' };
  const today = new Date().toISOString().slice(0, 10);
  const ageDays = (Date.parse(today) - Date.parse(body.day)) / 86400000;
  if (ageDays < -1 || ageDays > 31) return { ok: false, error: 'day_out_of_range' };
  const counts = {};
  for (const k of ['lookups', 'found', 'uncertain', 'not_found', 'skipped', 'cached']) { counts[k] = count(body[k]); if (counts[k] === null) return { ok: false, error: 'bad_' + k }; }
  const usd = typeof body.usd === 'number' && body.usd >= 0 && body.usd <= 10000 ? Math.round(body.usd * 10000) / 10000 : null;
  if (usd === null) return { ok: false, error: 'bad_usd' };
  const steps = {};
  if (body.steps && typeof body.steps === 'object' && !Array.isArray(body.steps)) {
    for (const [k, v] of Object.entries(body.steps)) {
      if (!STEP.test(k) || !v || typeof v !== 'object') return { ok: false, error: 'bad_steps' };
      const s = { calls: count(v.calls), hits: count(v.hits), errors: count(v.errors) };
      if (s.calls === null || s.hits === null || s.errors === null) return { ok: false, error: 'bad_steps' };
      steps[k] = s;
      if (Object.keys(steps).length > 32) return { ok: false, error: 'bad_steps' };
    }
  }
  const sources = {};
  if (body.sources && typeof body.sources === 'object' && !Array.isArray(body.sources)) {
    for (const [k, v] of Object.entries(body.sources)) { if (!SOURCE.test(k)) return { ok: false, error: 'bad_sources' }; const n = count(v); if (n === null) return { ok: false, error: 'bad_sources' }; sources[k] = n; }
  }
  const version = typeof body.version === 'string' && /^[0-9A-Za-z.\-]{0,20}$/.test(body.version) ? body.version : '';
  const lang = typeof body.lang === 'string' && /^[A-Za-z\-]{0,10}$/.test(body.lang) ? body.lang : '';
  return { ok: true, row: { install: body.install.toLowerCase(), day: body.day, version, lang, ...counts, usd, steps, sources } };
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' };
const reply = (status, body = null) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/health') return reply(200, { ok: true });
    if (url.pathname !== '/v1/daily') return reply(404, { error: 'not_found' });
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    if ((Number(request.headers.get('content-length')) || 0) > 16384) return reply(413, { error: 'too_large' });
    let body; try { body = await request.json(); } catch (_) { return reply(400, { error: 'bad_json' }); }
    const p = parseDaily(body);
    if (!p.ok) return reply(400, { error: p.error });
    const r = p.row;
    await env.DB.prepare(
      `INSERT INTO daily (install, day, version, lang, lookups, found, uncertain, not_found, skipped, cached, usd, steps, sources, received_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
       ON CONFLICT(install, day) DO UPDATE SET version=excluded.version, lang=excluded.lang, lookups=excluded.lookups, found=excluded.found,
         uncertain=excluded.uncertain, not_found=excluded.not_found, skipped=excluded.skipped, cached=excluded.cached, usd=excluded.usd,
         steps=excluded.steps, sources=excluded.sources, received_at=excluded.received_at`)
      .bind(r.install, r.day, r.version, r.lang, r.lookups, r.found, r.uncertain, r.not_found, r.skipped, r.cached, r.usd, JSON.stringify(r.steps), JSON.stringify(r.sources), new Date().toISOString())
      .run();
    return reply(204);
  },
};
