'use strict';
// Firecrawl Alexandria: POST /v2/scrape {alexandria:{provider, capability, options}}
//   -> {success, data:{alexandria:[{provider, capability, creditsCost, records, data|error}], creditsCost}}
// Credits, not dollars. USD_PER_CREDIT converts for the budget (Hobby $16/5000 ≈ 0.0032; Standard annual ≈ 0.00083).

const BASE = 'https://api.firecrawl.dev/v2';
const USD_PER_CREDIT = Number(process.env.FIRECRAWL_USD_PER_CREDIT) || 0.0032;

function providerError(code, extra = {}) { return Object.assign(new Error(code), { code, billing: 'none', usd: 0, ...extra }); }

function createFirecrawlClient({ apiKey, fetchImpl = globalThis.fetch, timeoutMs = 45000, usdPerCredit = USD_PER_CREDIT } = {}) {
  const configured = () => typeof apiKey === 'string' && apiKey.trim().length > 8 && typeof fetchImpl === 'function';

  async function call(provider, capability, options, { maxUsd, maxCredits }) {
    if (!configured()) throw providerError('FIRECRAWL_NOT_CONFIGURED');
    const price = maxCredits * usdPerCredit;
    if (price > maxUsd + 1e-9) throw providerError('FIRECRAWL_PRICE_OVER_CAP', { price, maxUsd });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res, body;
    try {
      res = await fetchImpl(BASE + '/scrape', { method: 'POST', signal: controller.signal,
        headers: { Authorization: 'Bearer ' + apiKey.trim(), 'Content-Type': 'application/json', 'x-request-id': require('crypto').randomUUID() },
        body: JSON.stringify({ alexandria: { provider, capability, options } }) });
      body = await res.json().catch(() => null);
    } catch (_) { throw providerError('FIRECRAWL_UNCERTAIN', { billing: 'unknown', price }); }
    finally { clearTimeout(timer); }
    if (res.status < 200 || res.status >= 300 || !body) {
      if ([400, 401, 402, 403, 404, 422, 429].includes(res.status)) throw providerError('FIRECRAWL_FAILED', { status: res.status, price, detail: body && (body.error || body.message) });
      throw providerError('FIRECRAWL_UNCERTAIN', { billing: 'unknown', status: res.status, price });
    }
    const d = body.data || body;
    const item = Array.isArray(d.alexandria) ? d.alexandria[0] : null;
    if (!item) throw providerError('FIRECRAWL_FAILED', { detail: 'no alexandria item', price });
    const credits = Number.isFinite(Number(item.creditsCost)) ? Number(item.creditsCost) : (Number.isFinite(Number(d.creditsCost)) ? Number(d.creditsCost) : null);
    const usd = credits == null ? null : credits * usdPerCredit;
    if (item.error) {
      const code = String(item.error.code || item.error.status || '').toLowerCase();
      if (/not_found|404/.test(code) || /not found/i.test(item.error.message || '')) return { status: 'miss', usd: usd || 0, billing: credits == null ? 'assumed' : 'reported', data: null, credits: credits || 0, price };
      throw providerError('FIRECRAWL_FAILED', { detail: item.error.message || code, usd: usd || 0, billing: credits == null ? 'unknown' : 'reported', price });
    }
    if (usd != null && usd > maxUsd + 1e-9) throw providerError('FIRECRAWL_COST_EXCEEDED', { usd, billing: 'reported', price });
    return { status: 'ok', usd, billing: credits == null ? 'unknown' : 'reported', data: item.data, credits, price };
  }
  return { isConfigured: configured, call, usdPerCredit, BASE };
}

module.exports = { createFirecrawlClient, providerError, USD_PER_CREDIT };
