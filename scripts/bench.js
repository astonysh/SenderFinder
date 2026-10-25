'use strict';
// Benchmark the waterfall on a CSV of real addresses (columns: email,name[,...]). Costs money within the caps.
//   npm run bench -- data/bench/wizleads-sample-50.csv --limit 10 [--offset 0] [--force]
// Writes data/bench/<csv-name>.results.json and prints per-step hit rates, name-match rates and spend.
const fs = require('fs'); const path = require('path');
const { config } = require('../server/config');
const { createStore } = require('../server/db');
const { createMonidClient } = require('../server/providers/monid');
const { createTregClient } = require('../server/providers/treg');
const { createFirecrawlClient } = require('../server/providers/firecrawl');
const { createLookup } = require('../server/waterfall');

const argv = process.argv.slice(2); const file = argv.find(a => !a.startsWith('--'));
const opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
if (!file) { console.error('usage: npm run bench -- <csv> [--limit n] [--offset n] [--force]'); process.exit(2); }
const limit = Number(opt('limit')) || Infinity, offset = Number(opt('offset')) || 0, force = argv.includes('--force');
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
const header = lines[0].split(',').map(s => s.trim().toLowerCase());
const rows = lines.slice(1).map(l => { const c = l.split(','); return Object.fromEntries(header.map((h, i) => [h, (c[i] || '').trim()])); }).filter(r => r.email).slice(offset, offset + limit);

const store = createStore({ file: config.dbPath, timeZone: config.timezone });
const svc = createLookup({ store, config, monid: createMonidClient({ apiKey: config.keys.monid }), treg: createTregClient({ token: config.keys.treg }), firecrawl: createFirecrawlClient({ apiKey: config.keys.firecrawl }) });
(async () => {
  const results = []; const t0 = Date.now();
  for (const [i, r] of rows.entries()) {
    const started = Date.now();
    try {
      const res = await svc.lookup({ email: r.email, name: r.name || undefined, source: 'bench', force });
      results.push({ email: r.email, name: r.name, status: res.status, step: res.match && res.match.step, nameMatched: res.match ? res.match.nameMatched : null, linkedinUrl: res.profile && res.profile.linkedinUrl, profileName: res.profile && res.profile.fullName, usd: res.cost.usd, cached: res.cached, calls: res.cost.calls });
      console.log(`${String(i + 1).padStart(3)}/${rows.length} ${r.email.padEnd(40)} ${res.status.padEnd(10)} ${(res.match && res.match.step || '-').padEnd(11)} name=${res.match ? res.match.nameMatched : '-'} $${res.cost.usd.toFixed(4)} ${Date.now() - started}ms`);
    } catch (e) { results.push({ email: r.email, name: r.name, status: 'error', error: e.code || e.message }); console.log(`${String(i + 1).padStart(3)}/${rows.length} ${r.email} ERROR ${e.code || e.message}`); }
  }
  const n = results.length, by = {};
  for (const r of results) for (const c of r.calls || []) { const b = by[c.step] = by[c.step] || { tried: 0, hit: 0, miss: 0, error: 0, skipped: 0, usd: 0 }; b[c.status === 'hit' ? 'hit' : c.status === 'miss' ? 'miss' : c.status === 'error' ? 'error' : 'skipped'] += 1; if (c.status !== 'skipped') b.tried += 1; b.usd += c.usd || 0; }
  const found = results.filter(r => r.status === 'found').length, unc = results.filter(r => r.status === 'uncertain').length, nf = results.filter(r => r.status === 'not_found').length;
  const usd = results.reduce((s, r) => s + (r.usd || 0), 0);
  console.log(`\n== ${n} addresses in ${((Date.now() - t0) / 1000).toFixed(0)}s: found ${found} (${(100 * found / n).toFixed(0)}%), uncertain ${unc}, not_found ${nf}, errors ${results.filter(r => r.status === 'error').length}; spend $${usd.toFixed(4)} (= $${(usd / n).toFixed(4)} per address, $${found ? (usd / found).toFixed(4) : '-'} per found)`);
  console.log('step         tried  hit  miss  err  hit%   usd      usd/hit'); for (const [s, b] of Object.entries(by)) console.log(`${s.padEnd(12)} ${String(b.tried).padStart(5)} ${String(b.hit).padStart(4)} ${String(b.miss).padStart(5)} ${String(b.error).padStart(4)} ${b.tried ? (100 * b.hit / b.tried).toFixed(0).padStart(4) + '%' : '    -'} ${b.usd.toFixed(4).padStart(8)} ${b.hit ? (b.usd / b.hit).toFixed(4).padStart(8) : '       -'}`);
  const winners = {}; for (const r of results) if (r.step) winners[r.step] = (winners[r.step] || 0) + 1; console.log('answered by:', JSON.stringify(winners));
  const out = path.join(path.dirname(file), path.basename(file, '.csv') + '.results.json');
  const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : []; const seen = new Set(results.map(r => r.email));
  fs.writeFileSync(out, JSON.stringify(prev.filter(r => !seen.has(r.email)).concat(results), null, 2)); console.log('results:', out);
  store.close();
})().catch(e => { console.error(e); process.exit(1); });
