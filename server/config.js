'use strict';
// Configuration from .env (loaded without dependencies) and process.env.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);
  else for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line.replace(/\s+#.*$/, ''));
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const num = (v, d) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) ? n : d; };
const bool = (v, d) => (v === undefined || v === '' ? d : !/^(0|false|no|off)$/i.test(String(v).trim()));
const str = v => (typeof v === 'string' ? v.trim() : '');

const DEFAULT_STEPS = ['signature', 'blitzapi', 'hunter', 'quickenrich', 'apollo', 'datalegion'];

const config = {
  root: ROOT,
  version: require('../package.json').version,
  port: num(process.env.PORT, 3390),
  host: str(process.env.HOST) || '127.0.0.1',
  appToken: str(process.env.APP_TOKEN),
  dbPath: path.resolve(ROOT, str(process.env.DB_PATH) || './data/email-linkedin.db'),
  keys: {
    monid: str(process.env.MONID_API_KEY),
    treg: str(process.env.TREG_API_TOKEN),
    firecrawl: str(process.env.FIRECRAWL_API_KEY),
  },
  lookupMaxUsd: num(process.env.LOOKUP_MAX_USD, 0.05),
  dailyCapUsd: num(process.env.DAILY_CAP_USD, 2),
  steps: str(process.env.STEPS) ? str(process.env.STEPS).split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_STEPS,
  skipFreeMail: bool(process.env.SKIP_FREE_MAIL, true),
  timezone: str(process.env.TZ_BUDGET) || 'Europe/Berlin',
};

module.exports = { config, DEFAULT_STEPS };
