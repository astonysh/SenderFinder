'use strict';
// treg.to: one token, many providers, priced per call. Pattern (as verified on
// the live catalog 2026-10-25):
//   GET  /catalog/endpoints/<slug>          -> {endpoint:{method, cost:{usd, type}, miss, …}}
//   POST /call/<slug>  body JSON            (endpoints whose method is POST)
//   GET  /call/<slug>?k=v                   (endpoints whose method is GET, "--query" in the catalog)
//   response header x-treg-cost-micro       micro-dollars actually charged (0 on a miss)
// The catalog price is read before every call and the call is refused above the cap.
// Calls are never retried: a lost answer after sending is reported as "uncertain".

const BASE = 'https://treg.to';

function providerError(code, extra = {}) { return Object.assign(new Error(code), { code, billing: 'none', usd: 0, ...extra }); }

function createTregClient({ token, fetchImpl = globalThis.fetch, timeoutMs = 25000, now = () => Date.now() } = {}) {
  const configured = () => typeof token === 'string' && token.trim().length > 8 && typeof fetchImpl === 'function';
  const catalogCache = new Map(); // slug -> {at, endpoint}

  async function send(method, path, { body, query } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const qs = query ? '?' + new URLSearchParams(query).toString() : '';
      const res = await fetchImpl(BASE + path + qs, { method, signal: controller.signal,
        headers: { 'X-Treg-Token': token.trim(), Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      const micro = res.headers && typeof res.headers.get === 'function' ? res.headers.get('x-treg-cost-micro') : null;
      return { status: res.status, micro, data: await res.json().catch(() => null) };
    } finally { clearTimeout(timer); }
  }

  async function catalog(slug) {
    const c = catalogCache.get(slug);
    if (c && now() - c.at < 10 * 60 * 1000) return c.endpoint;
    let r;
    try { r = await send('GET', '/catalog/endpoints/' + slug); } catch (_) { throw providerError('TREG_UNAVAILABLE'); }
    if (r.status < 200 || r.status >= 300 || !r.data) throw providerError('TREG_UNAVAILABLE', { status: r.status });
    const endpoint = r.data.endpoint || r.data;
    catalogCache.set(slug, { at: now(), endpoint });
    return endpoint;
  }

  // Returns {status:'hit'|'miss', usd, billing:'reported'|'unknown', data, price}
  async function call(slug, input, { maxUsd }) {
    if (!configured()) throw providerError('TREG_NOT_CONFIGURED');
    const ep = await catalog(slug);
    const price = ep.cost && Number.isFinite(Number(ep.cost.usd)) ? Number(ep.cost.usd) : null;
    if (price == null) throw providerError('TREG_PRICE_UNKNOWN');
    if (price > maxUsd + 1e-12) throw providerError('TREG_PRICE_OVER_CAP', { price, maxUsd });
    const method = String(ep.method || 'POST').toUpperCase();
    let r;
    try { r = method === 'GET' ? await send('GET', '/call/' + slug, { query: input }) : await send('POST', '/call/' + slug, { body: input }); }
    catch (_) { throw providerError('TREG_UNCERTAIN', { billing: 'unknown', price }); }
    const m = r.micro == null || r.micro === '' ? null : Number(r.micro);
    const usd = m != null && Number.isFinite(m) && m >= 0 ? m / 1e6 : null;
    if (r.status === 404 || (r.status >= 400 && r.status < 500 && usd === 0)) {
      // Treg answers 404 for "nobody on record" on several providers (hunter, village…): a free miss.
      if (r.status === 404 || r.status === 400) return { status: 'miss', usd: 0, billing: usd == null ? 'assumed' : 'reported', data: r.data, price };
    }
    if (r.status < 200 || r.status >= 300) {
      if ([401, 402, 403, 409, 422, 429].includes(r.status) && (usd == null || usd === 0)) throw providerError('TREG_FAILED', { status: r.status, price });
      throw providerError('TREG_UNCERTAIN', { billing: usd == null ? 'unknown' : 'reported', usd: usd || 0, status: r.status, price });
    }
    return { status: 'ok', usd: usd == null ? null : usd, billing: usd == null ? 'unknown' : 'reported', data: r.data, price };
  }

  return { isConfigured: configured, catalog, call, BASE };
}

module.exports = { createTregClient, providerError };
