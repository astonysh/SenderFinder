// Bumps the version in extension/manifest.json and package.json together and opens a CHANGELOG section.
//   npm run bump -- patch|minor|major|<x.y.z> ["one-line summary"]
import fs from 'node:fs'; import path from 'node:path';
import { ROOT_DIR } from './env.js';
const [arg, summary] = process.argv.slice(2);
if (!arg) { console.error('usage: npm run bump -- patch|minor|major|<x.y.z> ["summary"]'); process.exit(2); }
const mf = path.join(ROOT_DIR, 'extension', 'manifest.json'), pk = path.join(ROOT_DIR, 'package.json'), cl = path.join(ROOT_DIR, 'CHANGELOG.md');
const manifest = JSON.parse(fs.readFileSync(mf, 'utf8')), pkg = JSON.parse(fs.readFileSync(pk, 'utf8'));
const cur = manifest.version.split('.').map(Number);
const next = /^\d+\.\d+\.\d+$/.test(arg) ? arg : arg === 'major' ? `${cur[0] + 1}.0.0` : arg === 'minor' ? `${cur[0]}.${cur[1] + 1}.0` : arg === 'patch' ? `${cur[0]}.${cur[1]}.${cur[2] + 1}` : null;
if (!next) { console.error('bad version argument:', arg); process.exit(2); }
manifest.version = next; pkg.version = next;
fs.writeFileSync(mf, JSON.stringify(manifest, null, 2) + '\n'); fs.writeFileSync(pk, JSON.stringify(pkg, null, 2) + '\n');
const day = new Date().toISOString().slice(0, 10);
const head = `## ${next} (${day})\n\n${summary ? '- ' + summary + '\n' : '- \n'}\n`;
const old = fs.existsSync(cl) ? fs.readFileSync(cl, 'utf8') : '# Changelog\n\n';
fs.writeFileSync(cl, old.replace(/^# Changelog\n\n/, '# Changelog\n\n' + head));
console.log(`${manifest.version === next ? 'version' : ''} ${cur.join('.')} → ${next}; CHANGELOG.md section added. Reload the extension in chrome://extensions.`);
