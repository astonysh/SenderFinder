// Every locale must carry exactly the English keys, the same placeholders ($1…, $$) and a store description within Chrome's limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'extension', '_locales');
const read = loc => JSON.parse(fs.readFileSync(path.join(root, loc, 'messages.json'), 'utf8'));
const en = read('en');
const locales = fs.readdirSync(root).filter(d => fs.existsSync(path.join(root, d, 'messages.json')));
const placeholders = s => (s.match(/\$\$|\$\d/g) || []).sort().join(' ');
const curly = s => (s.match(/\{(first|name|company)\}/g) || []).sort().join(' ');

test('locales present', () => { assert.ok(locales.includes('en')); assert.ok(locales.length >= 2); });

for (const loc of locales) {
  test(`locale ${loc}: same keys as en`, () => {
    const m = read(loc);
    const missing = Object.keys(en).filter(k => !(k in m)), extra = Object.keys(m).filter(k => !(k in en));
    assert.deepEqual({ missing, extra }, { missing: [], extra: [] });
  });
  test(`locale ${loc}: messages are non-empty strings with the same placeholders`, () => {
    const m = read(loc);
    const bad = [];
    for (const [k, v] of Object.entries(m)) {
      const t = v && v.message;
      if (typeof t !== 'string' || !t.trim()) { bad.push(k + ': empty'); continue; }
      if (placeholders(t) !== placeholders(en[k].message)) bad.push(`${k}: placeholders "${placeholders(t)}" vs en "${placeholders(en[k].message)}"`);
      if (curly(t) !== curly(en[k].message)) bad.push(`${k}: {first}/{name}/{company} differ`);
      if (/(^|[^$])\$(?![$\d])/.test(t)) bad.push(k + ': lone $ (write $$ for a literal dollar sign)');
      if (Object.keys(v).some(x => x !== 'message')) bad.push(k + ': unexpected fields ' + Object.keys(v).join(','));
    }
    assert.deepEqual(bad, []);
  });
  test(`locale ${loc}: brand names and store description`, () => {
    const m = read(loc);
    assert.equal(m.ext_name.message, 'SenderFinder');
    assert.ok([...m.ext_description.message].length <= 132, `ext_description is ${[...m.ext_description.message].length} chars (max 132)`);
    assert.match(m.connect_signature.message, /SenderFinder/);
    assert.match(m.connect_note_default.message, /\{first\}/);
    const text = JSON.stringify(m);
    assert.ok(!/MonID/.test(text), 'use the official spelling "Monid"');
    assert.ok(!/Linkedin|LinkedIN/.test(text), 'use the official spelling "LinkedIn"');
  });
}
