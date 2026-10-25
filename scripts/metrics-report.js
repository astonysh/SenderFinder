// Monthly "data room" snapshot: the numbers an acquirer or sponsor would ask for, from every source that is
// configured, appended to docs/metrics/LOG.md. Sources that are not configured are listed as such, never faked.
//
//   node scripts/metrics-report.js            # print + append to docs/metrics/LOG.md
//   node scripts/metrics-report.js --dry-run  # print only
//
// Configuration (all optional, in .env or the environment):
//   GITHUB_REPO=owner/repo                    stars, forks, open issues, watchers (public API, no token needed)
//   CWS_ITEM_ID=<chrome web store item id>    user count scraped from the public listing page
//   CF_ACCOUNT_ID, CF_API_TOKEN, CF_D1_DATABASE_ID   telemetry table (D1 HTTP API; token needs D1 read)
//   CF_PAGES_PROJECT                          site visits via Cloudflare GraphQL analytics (same token, needs Analytics read)
//   METRICS_MANUAL_JSON=path.json             anything only visible in a dashboard, e.g. {"cws_weekly_users": 120, "sponsors_usd": 0}
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from './env.js';

const env = k => (process.env[k] || '').trim();
const dryRun = process.argv.includes('--dry-run');
const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);
const lastMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
const rows = [];       // [label, value, note]
const missing = [];    // sources not configured

async function getJson(url, init) { const r = await fetch(url, init); if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`); return r.json(); }

async function github() {
  const repo = env('GITHUB_REPO'); if (!repo) return missing.push('GITHUB_REPO（GitHub stars / forks / issues）');
  const j = await getJson(`https://api.github.com/repos/${repo}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'senderfinder-metrics' } });
  rows.push(['GitHub stars', j.stargazers_count], ['GitHub forks', j.forks_count], ['GitHub open issues', j.open_issues_count], ['GitHub watchers', j.subscribers_count]);
}
async function chromeWebStore() {
  const id = env('CWS_ITEM_ID'); if (!id) return missing.push('CWS_ITEM_ID（Chrome Web Store 用户数）');
  const r = await fetch(`https://chromewebstore.google.com/detail/${id}`, { headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'en' } });
  const html = await r.text();
  const m = html.match(/([\d,.]+)\s*(?:k|K)?\s*users/i);
  rows.push(['Chrome Web Store users（公开页）', m ? m[0].replace(/\s+/g, ' ') : '未能从页面解析', m ? '' : 'HTTP ' + r.status]);
  const rating = html.match(/(\d\.\d)\s*out of 5|(\d\.\d)\s*★|"ratingValue":"?(\d\.\d)/);
  if (rating) rows.push(['Chrome Web Store 评分', rating[1] || rating[2] || rating[3]]);
}
async function d1(sql) {
  const j = await getJson(`https://api.cloudflare.com/client/v4/accounts/${env('CF_ACCOUNT_ID')}/d1/database/${env('CF_D1_DATABASE_ID')}/query`,
    { method: 'POST', headers: { authorization: 'Bearer ' + env('CF_API_TOKEN'), 'content-type': 'application/json' }, body: JSON.stringify({ sql }) });
  if (!j.success) throw new Error('D1: ' + JSON.stringify(j.errors)); return j.result[0].results;
}
async function telemetry() {
  if (!env('CF_ACCOUNT_ID') || !env('CF_API_TOKEN') || !env('CF_D1_DATABASE_ID')) return missing.push('CF_ACCOUNT_ID / CF_API_TOKEN / CF_D1_DATABASE_ID（匿名使用统计）');
  const m = await d1(`SELECT substr(day,1,7) AS month, COUNT(DISTINCT install) AS installs, SUM(lookups) AS lookups, SUM(found) AS found, SUM(uncertain) AS uncertain, SUM(cached) AS cached, ROUND(SUM(usd),2) AS usd FROM daily WHERE day >= '${lastMonth}-01' GROUP BY 1 ORDER BY 1`);
  for (const r of m) rows.push([`统计 ${r.month} 活跃安装（opt-in）`, r.installs], [`统计 ${r.month} 查询次数`, r.lookups, `找到 ${r.found} · 不确定 ${r.uncertain} · 缓存 ${r.cached} · 用户花费 $${r.usd}`]);
  const w = await d1(`SELECT COUNT(DISTINCT install) AS n FROM daily WHERE day >= date('now','-7 days')`);
  rows.push(['统计 近 7 天活跃安装（opt-in）', w[0].n]);
  const steps = await d1(`SELECT steps FROM daily WHERE day >= '${lastMonth}-01'`);
  const agg = {};
  for (const r of steps) for (const [k, v] of Object.entries(JSON.parse(r.steps || '{}'))) { const a = agg[k] || (agg[k] = { calls: 0, hits: 0 }); a.calls += v.calls || 0; a.hits += v.hits || 0; }
  const line = Object.entries(agg).sort((a, b) => b[1].calls - a[1].calls).map(([k, v]) => `${k} ${v.calls} 次 / 命中 ${v.calls ? Math.round(v.hits / v.calls * 100) : 0}%`).join('，');
  if (line) rows.push(['统计 各步骤（近两个月）', line]);
}
async function pages() {
  if (!env('CF_ACCOUNT_ID') || !env('CF_API_TOKEN') || !env('CF_PAGES_PROJECT')) return missing.push('CF_PAGES_PROJECT（网站访问量）');
  const since = `${lastMonth}-01`;
  const q = { query: `{ viewer { accounts(filter:{accountTag:"${env('CF_ACCOUNT_ID')}"}) { series: httpRequestsAdaptiveGroups(limit:1000, filter:{datetime_geq:"${since}T00:00:00Z", clientRequestHTTPHost_like:"%${env('CF_PAGES_PROJECT')}%"}) { count sum { visits } dimensions { date } } } } }` };
  const j = await getJson('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { authorization: 'Bearer ' + env('CF_API_TOKEN'), 'content-type': 'application/json' }, body: JSON.stringify(q) });
  if (j.errors) throw new Error('GraphQL: ' + JSON.stringify(j.errors));
  const byMonth = {};
  for (const s of j.data.viewer.accounts[0].series) { const mm = s.dimensions.date.slice(0, 7); byMonth[mm] = (byMonth[mm] || 0) + (s.sum.visits || 0); }
  for (const [mm, v] of Object.entries(byMonth).sort()) rows.push([`网站访问 ${mm}`, v]);
}
function manual() {
  const p = env('METRICS_MANUAL_JSON'); if (!p) return missing.push('METRICS_MANUAL_JSON（后台才能看到的数字：周活、赞助收入等）');
  const j = JSON.parse(fs.readFileSync(path.resolve(ROOT_DIR, p), 'utf8'));
  for (const [k, v] of Object.entries(j)) rows.push([`手动 ${k}`, v]);
}

const errors = [];
for (const [name, fn] of [['GitHub', github], ['Chrome Web Store', chromeWebStore], ['telemetry', telemetry], ['Cloudflare Pages', pages], ['manual', manual]]) {
  try { await fn(); } catch (e) { errors.push(`${name}: ${e.message}`); }
}

const md = [`## ${today}`, '', '| 指标 | 数值 | 备注 |', '|---|---:|---|', ...rows.map(([l, v, n]) => `| ${l} | ${v} | ${n || ''} |`)];
if (missing.length) md.push('', '未配置的数据源：' + missing.join('；'));
if (errors.length) md.push('', '出错的数据源：' + errors.join('；'));
md.push('');
const text = md.join('\n');
console.log(text);
if (!dryRun) {
  const file = path.join(ROOT_DIR, 'docs', 'metrics', 'LOG.md');
  if (!fs.existsSync(file)) fs.writeFileSync(file, '# Metrics log\n\nAppended by `node scripts/metrics-report.js`. One section per run; newest at the bottom.\n\n');
  fs.appendFileSync(file, text + '\n');
  console.log('appended to', file);
}
