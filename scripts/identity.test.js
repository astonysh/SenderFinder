'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEmail, cleanDisplayName, nameMatches, normalizeLinkedInUrl, isFreeMail, isRoleAddress, nameHintFromEmail } = require('../server/identity');
const { extractLinkedInUrls, signatureBlock } = require('../server/signature');

test('emails are normalised and validated', () => {
  assert.equal(normalizeEmail(' Jane.Doe@Acme.COM '), 'jane.doe@acme.com');
  assert.equal(normalizeEmail('mailto:x@y.io'), 'x@y.io');
  assert.equal(normalizeEmail('<x@y.io>'), 'x@y.io');
  assert.equal(normalizeEmail('not an email'), null);
  assert.equal(isFreeMail('a@gmail.com'), true);
  assert.equal(isFreeMail('a@acme.com'), false);
  assert.equal(isRoleAddress('info@acme.com'), true);
  assert.equal(isRoleAddress('jane@acme.com'), false);
  assert.deepEqual(nameHintFromEmail('jane.doe@acme.com'), { first: 'jane', last: 'doe' });
});

test('display names: people kept, companies and addresses dropped', () => {
  assert.equal(cleanDisplayName('Jane Doe', 'jane@acme.com'), 'Jane Doe');
  assert.equal(cleanDisplayName('"Doe, Jane"', 'jane@acme.com'), 'Jane Doe');
  assert.equal(cleanDisplayName('Jane Doe | Acme GmbH', 'jane@acme.com'), 'Jane Doe');
  assert.equal(cleanDisplayName('Jane Doe (via Google Docs)', 'jane@acme.com'), 'Jane Doe');
  assert.equal(cleanDisplayName('jane@acme.com', 'jane@acme.com'), null);
  assert.equal(cleanDisplayName('Acme Support', 'support@acme.com'), null);
  assert.equal(cleanDisplayName('Support', 'support@acme.com'), null);
  assert.equal(cleanDisplayName('张伟', 'zw@acme.cn'), '张伟');
  assert.equal(cleanDisplayName('', 'x@y.io'), null);
});

test('name matching: accents, middle names, nicknames, initials, mismatch', () => {
  assert.equal(nameMatches('Jane Doe', 'Jane Doe'), true);
  assert.equal(nameMatches('Jane Doe', 'Jane A. Doe'), true);
  assert.equal(nameMatches('José García', 'Jose Garcia'), true);
  assert.equal(nameMatches('J. Doe', 'Jane Doe'), true);
  assert.equal(nameMatches('Jane Doe', 'John Smith'), false);
  assert.equal(nameMatches('Jane Doe', 'John Doe'), null);        // same surname, different first name: unsure
  assert.equal(nameMatches('Philip "Paqx" Quinn', 'Philip Andrew Quinn'), true);
  assert.equal(nameMatches('', 'Jane Doe'), null);
  assert.equal(nameMatches('张伟', '张伟'), true);
  assert.equal(nameMatches('张伟', '李娜'), false);
});

test('LinkedIn URLs are normalised', () => {
  assert.equal(normalizeLinkedInUrl('linkedin.com/in/janedoe'), 'https://www.linkedin.com/in/janedoe');
  assert.equal(normalizeLinkedInUrl('https://de.linkedin.com/in/jane-doe-123/?trk=x'), 'https://www.linkedin.com/in/jane-doe-123');
  assert.equal(normalizeLinkedInUrl('https://www.linkedin.com/company/acme'), null);
  assert.equal(normalizeLinkedInUrl('https://example.com/in/janedoe'), null);
  assert.equal(normalizeLinkedInUrl('http://www.linkedin.com/in/janedoe/'), 'https://www.linkedin.com/in/janedoe');
});

test('signature scan finds profile links, ignores company pages', () => {
  const text = 'Hi,\n\nthanks!\n\n--\nJane Doe\nHead of Partnerships, Acme\nhttps://www.linkedin.com/in/janedoe | https://www.linkedin.com/company/acme\n';
  assert.deepEqual(extractLinkedInUrls(signatureBlock(text)), ['https://www.linkedin.com/in/janedoe']);
  assert.deepEqual(extractLinkedInUrls('nothing here'), []);
  assert.match(signatureBlock('body\n\nBest regards,\nJane\nlinkedin.com/in/jd'), /^\nBest regards/i);
});
