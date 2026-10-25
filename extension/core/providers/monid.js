// Monid (api.monid.ai): discover / inspect are free, run is billed at the inspected price.
//   POST /v1/inspect {provider, endpoint}            -> {price:{type, amount:{value}, default:{…}, tiers}}
//   POST /v1/run {provider, endpoint, input:{queryParams|body}} -> 202 {runId, status}
//   GET  /v1/runs/:runId                             -> {status:'COMPLETED', output, cost:{value, currency}, billing:{reportedCost}}
// A no-match costs nothing on the endpoints used here (hunterio 404, apollo empty stub).

const BASE = 'https://api.monid.ai';
const PENDING = new Set(['READY', 'RUNNING', 'QUEUED', 'PENDING']);

export function providerError(code, extra = {}) { return Object.assign(new Error(code), { code, billing: 'none', usd: 0, ...extra }); }

export function basePrice(price) {
  const p = price && String(price.type || '').toUpperCase() === 'TIERED' ? price.default : price;
  if (!p || !/^PER_(CALL|RESULT|SUCCESS)$/.test(String(p.type || '').toUpperCase())) return null;
  const a = p.amount || {};
  if (String(a.currency || 'USD').toUpperCase() !== 'USD' || !Number.isFinite(Number(a.value))) return null;
  return Number(a.value);
}
export function costOf(data) {
  const r = data && data.billing && data.billing.reportedCost;
  if (r && Number.isFinite(Number(r.value))) { const u = String(r.unit || '').toUpperCase(); return u === 'MICRO_DOLLAR' ? Number(r.value) / 1e6 : Number(r.value); }
  const c = data && data.cost;
  if (c && Number.isFinite(Number(c.value)) && String(c.currency || 'USD').toUpperCase() === 'USD') return Number(c.value);
  return null;
}

export function createMonidClient({ apiKey, fetchImpl = globalThis.fetch, now = () => Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms)), pollMs = 1200, deadlineMs = 60000 } = {}) {
  const configured = () => typeof apiKey === 'string' && apiKey.trim().length > 8 && typeof fetchImpl === 'function';
  const priceCache = new Map();

  async function send(method, path, body, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, ms));
    try {
      const res = await fetchImpl(BASE + path, { method, signal: controller.signal,
        headers: { Authorization: 'Bearer ' + apiKey.trim(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: res.status, data: await res.json().catch(() => null) };
    } finally { clearTimeout(timer); }
  }

  async function inspect(provider, endpoint, ms = 15000) {
    const k = provider + ' ' + endpoint, c = priceCache.get(k);
    if (c && now() - c.at < 10 * 60 * 1000) return c.data;
    let r;
    try { r = await send('POST', '/v1/inspect', { provider, endpoint }, ms); } catch (_) { throw providerError('MONID_UNAVAILABLE'); }
    if (r.status < 200 || r.status >= 300 || !r.data) throw providerError('MONID_UNAVAILABLE', { status: r.status });
    priceCache.set(k, { at: now(), data: r.data });
    return r.data;
  }

  // Returns {status:'ok', usd, billing, output, price}
  async function run(provider, endpoint, input, { maxUsd }) {
    if (!configured()) throw providerError('MONID_NOT_CONFIGURED');
    const started = now(), left = () => deadlineMs - (now() - started);
    const info = await inspect(provider, endpoint, left());
    const price = basePrice(info.price);
    if (price == null) throw providerError('MONID_PRICE_UNKNOWN', { price: info.price || null });
    if (price > maxUsd + 1e-9) throw providerError('MONID_PRICE_OVER_CAP', { price, maxUsd });
    let r;
    try { r = await send('POST', '/v1/run', { provider, endpoint, input }, left()); }
    catch (_) { throw providerError('MONID_UNCERTAIN', { billing: 'unknown', price }); }
    let data = r.data && typeof r.data === 'object' ? r.data : null;
    if (!data || !data.status) {
      if ([400, 401, 402, 403, 404, 409, 422, 429].includes(r.status)) throw providerError('MONID_FAILED', { status: r.status, price, detail: data && (data.error || data.message) });
      throw providerError('MONID_UNCERTAIN', { billing: 'unknown', status: r.status, price });
    }
    while (PENDING.has(String(data.status).toUpperCase())) {
      if (!data.runId || left() <= 0) throw providerError('MONID_UNCERTAIN', { billing: 'unknown', runId: data.runId || null, price });
      await sleep(Math.min(pollMs, Math.max(0, left())));
      let q;
      try { q = await send('GET', '/v1/runs/' + encodeURIComponent(data.runId), null, left()); }
      catch (_) { throw providerError('MONID_UNCERTAIN', { billing: 'unknown', runId: data.runId, price }); }
      if (!q.data || typeof q.data !== 'object' || !q.data.status) throw providerError('MONID_UNCERTAIN', { billing: 'unknown', runId: data.runId, price });
      data = q.data;
    }
    const usd = costOf(data);
    const st = String(data.status).toUpperCase();
    if (st !== 'COMPLETED' && st !== 'SUCCEEDED' && st !== 'SUCCESS') {
      // Upstream 404 ("no person on record") comes back as a failed run with 0 cost on hunterio.
      const detail = JSON.stringify(data.error || data.output || data.message || '').slice(0, 300);
      if (/404|not[_ ]found|no (person|match)/i.test(detail) && (usd == null || usd === 0)) return { status: 'miss', usd: 0, billing: usd == null ? 'assumed' : 'reported', output: null, price };
      throw providerError('MONID_FAILED', { status: st, detail, usd: usd || 0, billing: usd == null ? 'unknown' : 'reported', price });
    }
    if (usd != null && usd > maxUsd + 1e-9) throw providerError('MONID_COST_EXCEEDED', { usd, billing: 'reported', price });
    return { status: 'ok', usd: usd == null ? null : usd, billing: usd == null ? 'unknown' : 'reported', output: data.output, price };
  }

  return { isConfigured: configured, inspect, run, BASE };
}

