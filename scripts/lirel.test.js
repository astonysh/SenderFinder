// Parsing of LinkedIn's relationship / profile responses (synthetic samples in the shapes the web API returns).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugOf, parseNetworkInfo, parseDashProfile, relationOf } from '../extension/core/lirel.js';

test('slugOf', () => {
  assert.equal(slugOf('https://www.linkedin.com/in/jane-doe-test/'), 'jane-doe-test');
  assert.equal(slugOf('https://de.linkedin.com/in/j%C3%BCrgen?x=1'), 'jürgen');
  assert.equal(slugOf('https://www.linkedin.com/company/acme'), null);
  assert.equal(slugOf(null), null);
});

test('parseNetworkInfo: plain and normalized', () => {
  assert.deepEqual(parseNetworkInfo({ distance: { value: 'DISTANCE_1' }, followable: true }), { distance: 1 });
  assert.deepEqual(parseNetworkInfo({ data: { entityUrn: 'x', distance: { value: 'DISTANCE_2' } }, included: [] }), { distance: 2 });
  assert.deepEqual(parseNetworkInfo({ distance: { value: 'OUT_OF_NETWORK' } }), { distance: 'out' });
  assert.deepEqual(parseNetworkInfo(null), { distance: null });
  assert.deepEqual(parseNetworkInfo({ distance: { value: 'SOMETHING_NEW' } }), { distance: null });
});

const vi = { rootUrl: 'https://media.licdn.com/dms/image/v2/ABC/profile-displayphoto-shrink_', artifacts: [{ width: 100, fileIdentifyingUrlPathSegment: '100_100/0/1?e=1&t=a' }, { width: 200, fileIdentifyingUrlPathSegment: '200_200/0/1?e=1&t=b' }, { width: 800, fileIdentifyingUrlPathSegment: '800_800/0/1?e=1&t=c' }] };
test('parseDashProfile: photo (not the background) and 1st-degree relationship', () => {
  const json = { data: {}, included: [
    { $type: 'com.linkedin.voyager.dash.identity.profile.Profile', publicIdentifier: 'jane-doe-test', backgroundPicture: { displayImageReference: { vectorImage: { ...vi, rootUrl: 'https://media.licdn.com/dms/image/v2/BG/bg_' } } },
      profilePicture: { displayImageReference: { vectorImage: vi } }, '*memberRelationship': 'urn:li:fsd_memberRelationship:1' },
    { $type: 'com.linkedin.voyager.dash.relationships.MemberRelationship', entityUrn: 'urn:li:fsd_memberRelationship:1', memberRelationshipUnion: { connection: { createdAt: 1 } } },
  ] };
  const r = parseDashProfile(json, 'jane-doe-test');
  assert.equal(r.photoUrl, 'https://media.licdn.com/dms/image/v2/ABC/profile-displayphoto-shrink_200_200/0/1?e=1&t=b');
  assert.equal(r.connected, true);
  assert.equal(relationOf({ distance: 2, ...r }), 'connected');
});
test('parseDashProfile: pending invitation, not connected', () => {
  const r = parseDashProfile({ elements: [{ publicIdentifier: 'x', memberRelationship: { memberRelationshipUnion: { noConnection: { memberDistance: 'DISTANCE_2', invitationUnion: { invitation: { invitationState: 'PENDING' } } } } } }] }, 'x');
  assert.equal(r.connected, false); assert.equal(r.pending, true); assert.equal(r.photoUrl, null); assert.equal(r.distance, 2);
  assert.equal(relationOf({ distance: 2, ...r }), 'pending');
});
test('parseDashProfile ignores non-LinkedIn image hosts', () => {
  assert.equal(parseDashProfile({ publicIdentifier: 'a', profilePicture: { vectorImage: { ...vi, rootUrl: 'https://evil.example/' } } }, 'a').photoUrl, null);
});
test('relationOf', () => {
  assert.equal(relationOf({ distance: 1 }), 'connected');
  assert.equal(relationOf({ distance: 3 }), 'degree3');
  assert.equal(relationOf({ distance: 'self' }), 'self');
  assert.equal(relationOf({}), null);
});
test('parseDashProfile: other people in the response (mutual connections) do not count', () => {
  const json = { included: [
    { publicIdentifier: 'arnaud-x', profilePicture: { displayImageReference: { vectorImage: { ...vi, rootUrl: 'https://media.licdn.com/dms/image/v2/ARN/p_' } } }, memberRelationship: { memberRelationshipUnion: { connection: {} } } },
    { publicIdentifier: 'phongnguyendang', profilePicture: { displayImageReference: { vectorImage: vi } }, '*memberRelationship': 'urn:li:fsd_memberRelationship:P' },
    { entityUrn: 'urn:li:fsd_memberRelationship:P', memberRelationshipUnion: { noConnection: { memberDistance: 'DISTANCE_2' } } },
  ] };
  const r = parseDashProfile(json, 'PhongNguyenDang');
  assert.ok(r.photoUrl.includes('/ABC/')); assert.equal(r.connected, false); assert.equal(r.distance, 2);
  assert.equal(relationOf(r), 'degree2');
});
test('parseDashProfile: pending invitation linked by URN (normalized response, as WebTopCardCore returns it)', () => {
  const json = { included: [
    { publicIdentifier: 'katie-h', profilePicture: { displayImageReference: { vectorImage: vi } }, '*memberRelationship': 'urn:li:fsd_memberRelationship:K' },
    { entityUrn: 'urn:li:fsd_memberRelationship:K', $type: 'com.linkedin.voyager.dash.relationships.MemberRelationship',
      memberRelationshipUnion: { noConnection: { memberDistance: 'DISTANCE_2', invitationUnion: { '*invitation': 'urn:li:fsd_invitation:9' } } }, memberRelationshipData: { noInvitation: null } },
    { entityUrn: 'urn:li:fsd_invitation:9', invitationState: 'PENDING', sentTime: 1 },
  ] };
  const r = parseDashProfile(json, 'katie-h');
  assert.equal(r.pending, true); assert.equal(r.distance, 2); assert.equal(relationOf(r), 'pending');
  assert.deepEqual(r.diag.u, { noConnection: ['memberDistance', 'invitationUnion'] });
});
test('companiesOf: position → company entity (LinkedIn page and website)', async () => {
  const { companiesOf } = await import('../extension/core/lirel.js');
  const all = [
    { companyName: 'Boomi', '*company': 'urn:li:fsd_company:1' },
    { entityUrn: 'urn:li:fsd_company:1', name: 'Boomi', url: 'https://www.linkedin.com/company/boomi/', websiteUrl: 'http://boomi.com' },
    { entityUrn: 'urn:li:fsd_company:2', name: 'InFlow', universalName: 'inflowpay' },
    { companyName: 'Tiny Startup' },
  ];
  assert.deepEqual(companiesOf(all), { boomi: { li: 'https://www.linkedin.com/company/boomi', web: 'https://boomi.com' }, inflow: { li: 'https://www.linkedin.com/company/inflowpay', web: null } });
});
