'use strict';
// One lookup from the terminal (may cost money, within the caps). Usage:
//   npm run lookup -- jane@acme.com "Jane Doe"
//   npm run lookup -- jane@acme.com "" --force
const { config } = require('../server/config');
const { createStore } = require('../server/db');
const { createMonidClient } = require('../server/providers/monid');
const { createTregClient } = require('../server/providers/treg');
const { createFirecrawlClient } = require('../server/providers/firecrawl');
const { createLookup } = require('../server/waterfall');

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const force = process.argv.includes('--force');
if (!args[0]) { console.error('usage: npm run lookup -- <email> [name] [--force]'); process.exit(2); }
const store = createStore({ file: config.dbPath, timeZone: config.timezone });
const svc = createLookup({ store, config, monid: createMonidClient({ apiKey: config.keys.monid }), treg: createTregClient({ token: config.keys.treg }), firecrawl: createFirecrawlClient({ apiKey: config.keys.firecrawl }), log: console.log });
svc.lookup({ email: args[0], name: args[1] || undefined, source: 'cli', force }).then(r => { console.log(JSON.stringify(r, null, 2)); store.close(); }).catch(e => { console.error(e.code || e.message); store.close(); process.exit(1); });
