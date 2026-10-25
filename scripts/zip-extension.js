// Packs extension/ into output/senderfinder-<version>.zip for the Chrome Web Store / manual install.
//   --store      strip the "key" field from manifest.json in the zip (the store derives the id itself; a "key" field
//                in an uploaded manifest is at best ignored). Everything else is byte-identical to extension/.
//   --with-key   also put extension-key.pem into the zip as key.pem: do that for the FIRST Web Store upload so the
//                store keeps the same extension id as the unpacked build (manifest.json carries the matching public key).
// Usage: npm run zip -- --store --with-key   (first upload)   ·   npm run zip -- --store   (updates)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT_DIR } from './env.js';
const args = process.argv.slice(2);
const src = path.join(ROOT_DIR, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
const out = path.join(ROOT_DIR, 'output', `senderfinder-${manifest.version}${args.includes('--store') ? '-store' : ''}.zip`);
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.rmSync(out, { force: true });
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'senderfinder-zip-'));
try {
  fs.cpSync(src, stage, { recursive: true, filter: p => !/\.DS_Store$|\.zip$/.test(p) });
  if (args.includes('--store')) { const { key, ...rest } = manifest; fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(rest, null, 2) + '\n'); }
  if (args.includes('--with-key')) { fs.copyFileSync(path.join(ROOT_DIR, 'extension-key.pem'), path.join(stage, 'key.pem')); console.log('included key.pem (first Web Store upload only)'); }
  execFileSync('zip', ['-qr', out, '.'], { cwd: stage, stdio: 'inherit' });
} finally { fs.rmSync(stage, { recursive: true, force: true }); }
console.log(`${path.relative(ROOT_DIR, out)}  (${(fs.statSync(out).size / 1024).toFixed(0)} KB, v${manifest.version}${args.includes('--store') ? ', manifest "key" stripped' : ''})`);
