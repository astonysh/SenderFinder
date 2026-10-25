import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfile, imageUrl, twitterUrl, findLinkedIn, domainOf, companyLinkedIn } from '../extension/core/providers/profile.js';

test('photo: only public http(s) URLs are kept', () => {
  assert.equal(imageUrl('https://media.licdn.com/dms/image/abc/profile-displayphoto_400_400?e=1&v=beta&t=x'), 'https://media.licdn.com/dms/image/abc/profile-displayphoto_400_400?e=1&v=beta&t=x');
  assert.equal(imageUrl('data:image/png;base64,AAAA'), null);
  assert.equal(imageUrl('javascript:alert(1)'), null);
  assert.equal(imageUrl('//cdn.example.com/a.png'), null);
  assert.equal(imageUrl(''), null); assert.equal(imageUrl(null), null);
});

test('twitter: URL or handle becomes https://x.com/<handle>', () => {
  assert.equal(twitterUrl('https://twitter.com/rahulvohra'), 'https://x.com/rahulvohra');
  assert.equal(twitterUrl('http://www.x.com/@RahulVohra?s=20'), 'https://x.com/RahulVohra');
  assert.equal(twitterUrl('@rahulvohra'), 'https://x.com/rahulvohra');
  assert.equal(twitterUrl({ handle: 'rahulvohra' }), 'https://x.com/rahulvohra');
  assert.equal(twitterUrl('https://twitter.com/intent/follow?screen_name=x'), null);
  assert.equal(twitterUrl('not a handle!'), null); assert.equal(twitterUrl(null), null);
});

test('normalizeProfile carries photo, twitter and a time zone (provider value wins, else guessed from location)', () => {
  const apollo = normalizeProfile({ first_name: 'Jane', last_name: 'Doe', linkedin_url: 'https://www.linkedin.com/in/janedoe', title: 'CTO', photo_url: 'https://media.licdn.com/dms/image/x/photo.jpg', twitter_url: 'https://twitter.com/janedoe', city: 'Berlin', country: 'Germany', organization: { name: 'Acme', primary_domain: 'acme.com' } }, { provider: 'monid:apollo/people/match' });
  assert.equal(apollo.photoUrl, 'https://media.licdn.com/dms/image/x/photo.jpg');
  assert.equal(apollo.twitterUrl, 'https://x.com/janedoe');
  assert.equal(apollo.location, 'Berlin, Germany'); assert.equal(apollo.timeZone, 'Europe/Berlin');
  const hunter = normalizeProfile({ full_name: 'Jane Doe', linkedin_url: 'https://www.linkedin.com/in/janedoe', location: 'San Francisco, CA, US', timeZone: 'America/Los_Angeles', photo_url: 'https://d1.hunter.example/avatar.png', twitter: { handle: 'janedoe' } });
  assert.equal(hunter.timeZone, 'America/Los_Angeles'); assert.equal(hunter.twitterUrl, 'https://x.com/janedoe'); assert.equal(hunter.photoUrl, 'https://d1.hunter.example/avatar.png');
  const bogus = normalizeProfile({ full_name: 'Jane Doe', linkedin_url: 'https://www.linkedin.com/in/janedoe', location: 'Berlin, Germany', timeZone: 'Mars/Olympus' });
  assert.equal(bogus.timeZone, 'Europe/Berlin', 'an invalid provider zone falls back to the location guess');
  const nowhere = normalizeProfile({ full_name: 'Jane Doe', linkedin_url: 'https://www.linkedin.com/in/janedoe' });
  assert.equal(nowhere.timeZone, null); assert.equal(nowhere.photoUrl, null); assert.equal(nowhere.twitterUrl, null);
});

test('profile never carries phone numbers or personal emails', () => {
  const p = normalizeProfile({ full_name: 'Jane Doe', linkedin_url: 'https://www.linkedin.com/in/janedoe', phone: '+49 30 1234', personal_emails: ['jane@gmail.com'], mobile_phone: '+49 170 0000' });
  const s = JSON.stringify(p);
  assert.equal(s.includes('+49'), false); assert.equal(s.includes('gmail.com'), false);
});

test('findLinkedIn: a company id is never taken for a person (Apollo organization.linkedin_uid → /in/3039 was a 404)', () => {
  const apollo = { person: { name: 'Brian Amen', linkedin_url: null, title: 'Senior Director', organization: { name: 'Sony Music Entertainment', linkedin_uid: '3039', linkedin_url: 'http://www.linkedin.com/company/sony-music-entertainment' } } };
  assert.equal(findLinkedIn(apollo), null);
  assert.equal(findLinkedIn({ employee_linkedin: '123456' }), null);
  assert.equal(findLinkedIn({ employee_linkedin: 'brian-amen-1a2b3c' }), 'https://www.linkedin.com/in/brian-amen-1a2b3c');
  assert.equal(findLinkedIn({ person: { linkedin_url: 'http://www.linkedin.com/in/brian-amen', organization: { linkedin_uid: '3039' } } }), 'https://www.linkedin.com/in/brian-amen');
});

test('company website / LinkedIn page per position', () => {
  assert.equal(domainOf('https://www.Boomi.com/about'), 'boomi.com');
  assert.equal(domainOf('inflowpay.ai'), 'inflowpay.ai');
  assert.equal(domainOf('https://www.linkedin.com/company/boomi'), null);
  assert.equal(domainOf('not a domain'), null);
  assert.equal(companyLinkedIn('http://www.linkedin.com/company/boomi/about/'), 'https://www.linkedin.com/company/boomi');
  assert.equal(companyLinkedIn('https://www.linkedin.com/in/someone'), null);
  const p = normalizeProfile({ name: 'X Y', linkedin_url: 'https://www.linkedin.com/in/xy', employment_history: [
    { title: 'Head of BD', organization_name: 'InFlow', current: true },
    { title: 'PO', company: { name: 'Boomi', website: 'https://boomi.com', linkedin_url: 'linkedin.com/company/boomi' }, current: true },
  ] });
  assert.deepEqual(p.positions.map(x => [x.company, x.domain, x.companyLinkedin]), [['InFlow', null, null], ['Boomi', 'boomi.com', 'https://www.linkedin.com/company/boomi']]);
});
