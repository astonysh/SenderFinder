// Dev helpers (probe / lookup CLI) read provider keys from .env or the environment. The extension never does.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
const str = v => (typeof v === 'string' ? v.trim() : '');
export const ROOT_DIR = ROOT;
export const keys = { monid: str(process.env.MONID_API_KEY), treg: str(process.env.TREG_API_TOKEN), firecrawl: str(process.env.FIRECRAWL_API_KEY) };
export const config = {
  steps: str(process.env.STEPS) ? str(process.env.STEPS).split(',').map(s => s.trim()).filter(Boolean) : undefined,
  lookupMaxUsd: Number(process.env.LOOKUP_MAX_USD) || 0.05,
  dailyCapUsd: process.env.DAILY_CAP_USD !== undefined && process.env.DAILY_CAP_USD !== '' ? Number(process.env.DAILY_CAP_USD) : 2,
  skipFreeMail: !/^(0|false|no|off)$/i.test(str(process.env.SKIP_FREE_MAIL) || 'true'),
};
