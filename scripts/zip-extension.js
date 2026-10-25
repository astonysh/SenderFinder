// Packs extension/ into a browser upload archive or manual-install archive.
//   --store      strip only the development "key" field from manifest.json; all extension code and features are kept.
//   --edge       name the Chromium archive for Microsoft Edge Add-ons and strip the development "key" field.
// Never bundle extension-key.pem: it is private signing material and must stay out of uploaded / released archives.
// Usage: npm run zip -- --store  ·  npm run zip:edge
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT_DIR } from './env.js';
const args = process.argv.slice(2);
if (args.includes('--with-key')) throw new Error('--with-key is no longer supported; never bundle the private key');
const isEdge = args.includes('--edge');
if (isEdge && args.includes('--store')) throw new Error('--edge and --store are separate packaging targets');
const src = path.join(ROOT_DIR, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
const prefix = isEdge ? 'senderfinder-edge-' : 'senderfinder-';
const out = path.join(ROOT_DIR, 'output', `${prefix}${manifest.version}${args.includes('--store') ? '-store' : ''}.zip`);
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.rmSync(out, { force: true });
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'senderfinder-zip-'));
try {
  fs.cpSync(src, stage, { recursive: true, filter: p => !/\.DS_Store$|\.zip$/.test(p) });
  if (args.includes('--store') || isEdge) {
    const { key, ...rest } = manifest;
    fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(rest, null, 2) + '\n');
  }
  execFileSync('zip', ['-qr', out, '.'], { cwd: stage, stdio: 'inherit' });
} finally { fs.rmSync(stage, { recursive: true, force: true }); }
console.log(`${path.relative(ROOT_DIR, out)}  (${(fs.statSync(out).size / 1024).toFixed(0)} KB, v${manifest.version}${args.includes('--store') || isEdge ? ', manifest "key" stripped' : ''})`);
