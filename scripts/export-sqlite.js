// Migration from the old server version (v0.1): turn its SQLite database into the extension's
// JSON import format. Usage: npm run migrate:sqlite -- [path/to/senderfinder.db] [out.json]
// Then: extension settings → 数据 → 导入 JSON.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT_DIR } from './env.js';

const dbPath = process.argv[2] || path.join(ROOT_DIR, 'data', 'senderfinder.db');
const out = process.argv[3] || path.join(ROOT_DIR, 'data', 'senderfinder-export.json');
if (!fs.existsSync(dbPath)) { console.error('no database at', dbPath); process.exit(2); }
const db = new DatabaseSync(dbPath, { readOnly: true });
const lookups = db.prepare('SELECT * FROM lookups').all().map(r => ({
  email: r.email, status: r.status, nameGiven: r.name_given || null, source: r.source || null,
  profile: r.profile_json ? JSON.parse(r.profile_json) : null, match: r.match_json ? JSON.parse(r.match_json) : null,
  cost: { usd: Number(r.cost_usd) || 0, calls: r.calls_json ? JSON.parse(r.calls_json) : [] },
  skippedReason: r.skipped_reason || null, lookedUpAt: r.looked_up_at, createdAt: r.created_at,
}));
const ledger = db.prepare(`SELECT day, COALESCE(SUM(usd),0) AS usd, COUNT(*) AS calls, SUM(CASE WHEN status='hit' THEN 1 ELSE 0 END) AS hits FROM calls GROUP BY day`).all()
  .map(r => ({ day: r.day, usd: Number(r.usd) || 0, calls: Number(r.calls) || 0, hits: Number(r.hits) || 0 }));
const providers = db.prepare(`SELECT provider, COUNT(*) AS calls, SUM(CASE WHEN status='hit' THEN 1 ELSE 0 END) AS hits, SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors, COALESCE(SUM(usd),0) AS usd, COALESCE(SUM(ms),0) AS ms FROM calls WHERE provider <> 'local' GROUP BY provider`).all()
  .map(r => ({ provider: r.provider, calls: Number(r.calls) || 0, hits: Number(r.hits) || 0, errors: Number(r.errors) || 0, usd: Number(r.usd) || 0, ms: Number(r.ms) || 0 }));
db.close();
fs.writeFileSync(out, JSON.stringify({ format: 'senderfinder/1', exportedAt: new Date().toISOString(), lookups, ledger, providers }, null, 1));
console.log(`wrote ${out}: ${lookups.length} lookups, ${ledger.length} days, ${providers.length} providers`);
