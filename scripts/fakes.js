'use strict';
// Synthetic provider clients for tests. No network, no real data.
function fakeTreg({ answers = {}, prices = {} } = {}) {
  const calls = [];
  return {
    calls,
    isConfigured: () => true,
    async catalog(slug) { return { method: 'POST', cost: { usd: prices[slug] ?? 0.0005 } }; },
    async call(slug, input, { maxUsd }) {
      calls.push({ slug, input, maxUsd });
      const price = prices[slug] ?? 0.0005;
      if (price > maxUsd + 1e-12) throw Object.assign(new Error('TREG_PRICE_OVER_CAP'), { code: 'TREG_PRICE_OVER_CAP', billing: 'none', usd: 0 });
      const a = typeof answers[slug] === 'function' ? answers[slug](input) : answers[slug];
      if (a instanceof Error) throw a;
      if (!a) return { status: 'miss', usd: 0, billing: 'reported', data: { found: false }, price };
      return { status: 'ok', usd: a.usd ?? price, billing: 'reported', data: a.data, price };
    },
  };
}
function fakeMonid({ answers = {}, prices = {} } = {}) {
  const calls = [];
  return {
    calls,
    isConfigured: () => true,
    async inspect(provider, endpoint) { return { price: { type: 'PER_CALL', amount: { value: prices[provider + endpoint] ?? 0.0049, currency: 'USD' } } }; },
    async run(provider, endpoint, input, { maxUsd }) {
      const k = provider + endpoint; calls.push({ provider, endpoint, input, maxUsd });
      const price = prices[k] ?? 0.0049;
      if (price > maxUsd + 1e-9) throw Object.assign(new Error('MONID_PRICE_OVER_CAP'), { code: 'MONID_PRICE_OVER_CAP', billing: 'none', usd: 0 });
      const a = typeof answers[k] === 'function' ? answers[k](input) : answers[k];
      if (a instanceof Error) throw a;
      if (!a) return { status: 'miss', usd: 0, billing: 'reported', output: null, price };
      return { status: 'ok', usd: a.usd ?? price, billing: 'reported', output: a.output, price };
    },
  };
}
function fakeFirecrawl({ answers = {} } = {}) {
  const calls = [];
  return {
    calls, usdPerCredit: 0.0032,
    isConfigured: () => true,
    async call(provider, capability, options, { maxUsd, maxCredits }) {
      calls.push({ provider, capability, options, maxUsd, maxCredits });
      const a = answers[provider + '/' + capability];
      if (!a) return { status: 'miss', usd: 0, billing: 'reported', data: null, credits: 0, price: maxCredits * 0.0032 };
      return { status: 'ok', usd: (a.credits ?? maxCredits) * 0.0032, billing: 'reported', data: a.data, credits: a.credits ?? maxCredits, price: maxCredits * 0.0032 };
    },
  };
}
const notConfigured = () => ({ isConfigured: () => false, calls: [], async call() { throw new Error('not configured'); }, async run() { throw new Error('not configured'); } });

module.exports = { fakeTreg, fakeMonid, fakeFirecrawl, notConfigured };
