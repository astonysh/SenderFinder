'use strict';
// Free live checks of the three providers with the keys in .env: catalog price (treg),
// inspect (MonID), find-tools (Firecrawl). Nothing here costs money.
// Usage: npm run probe
const { config } = require('../server/config');
const { createMonidClient } = require('../server/providers/monid');
const { createTregClient } = require('../server/providers/treg');
const { createFirecrawlClient } = require('../server/providers/firecrawl');
const { STEPS } = require('../server/waterfall');

(async () => {
  const monid = createMonidClient({ apiKey: config.keys.monid });
  const treg = createTregClient({ token: config.keys.treg });
  const fc = createFirecrawlClient({ apiKey: config.keys.firecrawl });
  console.log('steps configured:', config.steps.join(' → '));
  console.log('');
  console.log('treg:', treg.isConfigured() ? 'token set' : 'NO TOKEN');
  if (treg.isConfigured()) for (const slug of ['blitzapi.people.email.reverse', 'quickenrich.people.enrich', 'village.people.from_email', 'treg.linkedin.user.profile']) {
    try { const e = await treg.catalog(slug); console.log(`  ${slug}: ${e.method} $${e.cost && e.cost.usd} (${e.cost && e.cost.type}) hit_rate=${e.observed && e.observed.hit_rate}`); }
    catch (e) { console.log(`  ${slug}: ERROR ${e.code || e.message}`); }
  }
  console.log('monid:', monid.isConfigured() ? 'key set' : 'NO KEY');
  if (monid.isConfigured()) for (const [p, ep] of [['hunterio', '/people/find'], ['apollo', '/people/match'], ['contactout', '/v1/people/enrich/work-email']]) {
    try { const i = await monid.inspect(p, ep); const pr = i.price || {}; const base = pr.type === 'TIERED' ? pr.default : pr; console.log(`  ${p}${ep}: $${base && base.amount && base.amount.value} (${pr.type}) ${(i.price && i.price.notes || []).join(' | ').slice(0, 120)}`); }
    catch (e) { console.log(`  ${p}${ep}: ERROR ${e.code || e.message} ${e.status || ''}`); }
  }
  console.log('firecrawl:', fc.isConfigured() ? 'key set' : 'NO KEY (optional)');
  if (fc.isConfigured()) {
    try { const r = await fc.call('firecrawl', 'find-tools', { providers: ['datalegion'], level: 'tools', limit: 10 }, { maxUsd: 0.01, maxCredits: 0 });
      const tools = (r.data && (r.data.tools || r.data)) || []; console.log(`  find-tools ok, credits=${r.credits}; datalegion tools: ${(Array.isArray(tools) ? tools : []).map(t => t.capability + '=' + t.credits).join(', ')}`); }
    catch (e) { console.log(`  find-tools ERROR ${e.code || e.message} ${e.detail || ''}`); }
  }
  console.log('');
  for (const id of config.steps) { const s = STEPS[id]; if (s) console.log(`  ${id.padEnd(12)} cap $${s.maxUsd}  ${s.provider}`); }
})().catch(e => { console.error(e); process.exit(1); });
