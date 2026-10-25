import test from 'node:test';
import assert from 'node:assert/strict';
import { composeNote, fillTemplate, firstNameOf, NOTE_MAX } from '../extension/core/connect.js';

test('firstNameOf', () => {
  assert.equal(firstNameOf('Rahul Vohra'), 'Rahul'); assert.equal(firstNameOf('Dr. Jane Doe'), 'Jane'); assert.equal(firstNameOf('王小明'), '王小明'); assert.equal(firstNameOf(''), ''); assert.equal(firstNameOf(null), '');
});

test('placeholders are filled; missing values leave no dangling punctuation', () => {
  assert.equal(fillTemplate('Hi {first}, we emailed about {company}.', { name: 'Rahul Vohra', company: 'Rapportive' }), 'Hi Rahul, we emailed about Rapportive.');
  assert.equal(fillTemplate('你好 {first}，刚和你邮件联系过。', { name: '王小明' }), '你好 王小明，刚和你邮件联系过。');
  assert.equal(fillTemplate('Hi {first}, nice to meet you.', {}), 'Hi, nice to meet you.');
  assert.equal(fillTemplate('{company} looks great, {first}.', { name: 'Jane Doe' }), 'looks great, Jane.');
});

test('composeNote keeps the signature whole and trims the body to the LinkedIn limit', () => {
  const sig = '— sent via SenderFinder, github.com/example/senderfinder';
  const short = composeNote({ template: 'Hi {first}!', vars: { name: 'Jane Doe' }, signature: sig });
  assert.equal(short, 'Hi Jane!\n\n' + sig);
  const long = composeNote({ template: 'x'.repeat(400), vars: {}, signature: sig });
  assert.ok(long.length <= NOTE_MAX, 'within limit: ' + long.length); assert.ok(long.endsWith(sig), 'signature intact'); assert.ok(long.includes('…'));
  const noSig = composeNote({ template: 'y'.repeat(400), vars: {} });
  assert.equal(noSig.length, NOTE_MAX); assert.ok(noSig.endsWith('…'));
  assert.equal(composeNote({ template: '', vars: {}, signature: sig }), sig);
});
