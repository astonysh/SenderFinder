import test from 'node:test';
import assert from 'node:assert/strict';
import { companyKeyword, searchQuery, profileUrlOf, parseTitle, pickProfile } from '../extension/core/websearch.js';

test('companyKeyword: the distinctive label of a work domain', () => {
  assert.equal(companyKeyword('monid.ai'), 'monid'); assert.equal(companyKeyword('mail.acme.co.uk'), 'acme'); assert.equal(companyKeyword('revelator.com'), 'revelator');
  assert.equal(companyKeyword(''), null); assert.equal(companyKeyword(null), null);
});
test('searchQuery quotes the name and adds the company keyword', () => {
  assert.equal(searchQuery({ name: 'Zongrong Li', domain: 'monid.ai' }), '"Zongrong Li" monid');
  assert.equal(searchQuery({ name: '', domain: 'monid.ai' }), null); assert.equal(searchQuery({ name: 'A B', domain: null }), null);
});
test('profileUrlOf: /in/ pages directly, posts by their author', () => {
  assert.equal(profileUrlOf('https://www.linkedin.com/in/zongrong-jasper-li-61457b287?trk=x'), 'https://www.linkedin.com/in/zongrong-jasper-li-61457b287');
  assert.equal(profileUrlOf('https://www.linkedin.com/posts/zongrong-jasper-li-61457b287_im-happy-activity-7517328265355673600-HyI7'), 'https://www.linkedin.com/in/zongrong-jasper-li-61457b287');
  assert.equal(profileUrlOf('https://www.linkedin.com/company/monid'), null); assert.equal(profileUrlOf('https://example.com/in/x'), null);
});
test('parseTitle splits name, headline, title and company', () => {
  assert.deepEqual(parseTitle('Zongrong(Jasper) Li - Head of Growth at Monid.ai - LinkedIn'), { fullName: 'Zongrong(Jasper) Li', headline: 'Head of Growth at Monid.ai', title: 'Head of Growth', company: 'Monid.ai' });
  assert.deepEqual(parseTitle('Jane Doe | LinkedIn'), { fullName: 'Jane Doe', headline: null, title: null, company: null });
  assert.equal(parseTitle(''), null);
});
test('pickProfile prefers the profile page, requires a name match and the company keyword', () => {
  const web = [
    { url: 'https://www.linkedin.com/posts/zongrong-jasper-li-61457b287_x-activity-1-a', title: 'Zongrong(Jasper) Li posted this - LinkedIn', description: 'Head of Growth at Monid!' },
    { url: 'https://www.linkedin.com/in/zongrong-jasper-li-61457b287', title: 'Zongrong(Jasper) Li - Head of Growth at Monid.ai - LinkedIn', description: 'Im the Head of Growth at Monid' },
  ];
  const p = pickProfile(web, { name: 'Zongrong Li', domain: 'monid.ai' });
  assert.equal(p.linkedinUrl, 'https://www.linkedin.com/in/zongrong-jasper-li-61457b287'); assert.equal(p.title, 'Head of Growth'); assert.equal(p.provider, 'firecrawl:search');
  const onlyPost = pickProfile([web[0]], { name: 'Zongrong Li', domain: 'monid.ai' });
  assert.equal(onlyPost.linkedinUrl, 'https://www.linkedin.com/in/zongrong-jasper-li-61457b287'); assert.equal(onlyPost.headline, null);
  assert.equal(pickProfile(web, { name: 'Wei Zhang', domain: 'monid.ai' }), null);
  assert.equal(pickProfile(web, { name: 'Zongrong Li', domain: 'acme.com' }), null);
  assert.equal(pickProfile(web, { name: 'Zongrong Li', domain: null }), null);
});
