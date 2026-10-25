// One lookup from the terminal with the keys in .env (may cost money, within the caps).
// Cache and ledger go to ./data/cli-cache.json so the CLI never double-pays either.
//   npm run lookup -- jane@acme.com "Jane Doe"      npm run lookup -- jane@acme.com "" --force
import fs from 'node:fs';
import path from 'node:path';
import { keys, config, ROOT_DIR } from './env.js';
import { createStore, memoryBackend } from '../extension/core/store.js';
import { createLookup } from '../extension/core/waterfall.js';
import { createMonidClient } from '../extension/core/providers/monid.js';
import { createTregClient } from '../extension/core/providers/treg.js';
import { createFirecrawlClient } from '../extension/core/providers/firecrawl.js';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const force = process.argv.includes('--force');
if (!args[0]) { console.error('usage: npm run lookup -- <email> [name] [--force]'); process.exit(2); }
const file = path.join(ROOT_DIR, 'data', 'cli-cache.json');
const store = createStore({ backend: memoryBackend() });
if (fs.existsSync(file)) await store.importAll(JSON.parse(fs.readFileSync(file, 'utf8')));
const svc = createLookup({ store, config, monid: createMonidClient({ apiKey: keys.monid }), treg: createTregClient({ token: keys.treg }), firecrawl: createFirecrawlClient({ apiKey: keys.firecrawl }), log: console.error });
try {
  const r = await svc.lookup({ email: args[0], name: args[1] || undefined, source: 'cli', force });
  console.log(JSON.stringify(r, null, 2));
} catch (e) { console.error(e.code || e.message); process.exitCode = 1; }
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(await store.exportAll()));
