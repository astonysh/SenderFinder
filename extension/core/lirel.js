// The signed-in user's relationship to a LinkedIn profile (1st/2nd/3rd degree, invitation pending) and the
// profile photo, read from LinkedIn's own web API with the user's session. Pure parsing here; the fetching
// (cookies, csrf header, cache, rate limit) lives in background.js. Responses are walked tolerantly because
// LinkedIn changes field paths often; anything unrecognised just yields null.

// Public identifier from a profile URL: https://www.linkedin.com/in/jane-doe-123/ → "jane-doe-123".
export function slugOf(url) {
  const m = /^https:\/\/(?:[a-z]{2,3}\.|www\.)?linkedin\.com\/in\/([^/?#]+)/i.exec(String(url || ''));
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; }
}

const DISTANCE = { DISTANCE_1: 1, DISTANCE_2: 2, DISTANCE_3: 3, OUT_OF_NETWORK: 'out', SELF: 'self' };

function* walk(v, path = []) {
  if (!v || typeof v !== 'object') return;
  yield [v, path];
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) yield* walk(v[i], path); return; }
  for (const [k, x] of Object.entries(v)) yield* walk(x, path.concat(k));
}

// networkinfo → { distance }. Shape: { distance: { value: "DISTANCE_2" }, ... } (possibly wrapped in data/included).
export function parseNetworkInfo(json) {
  for (const [o] of walk(json)) {
    const d = o.distance && typeof o.distance === 'object' ? o.distance.value : typeof o.distance === 'string' ? o.distance : null;
    if (d && d in DISTANCE) return { distance: DISTANCE[d] };
  }
  return { distance: null };
}

// Best image from a VectorImage ({ rootUrl, artifacts: [{ width, fileIdentifyingUrlPathSegment }] }), aiming for ~200px.
function vectorImageUrl(vi) {
  if (!vi || typeof vi.rootUrl !== 'string' || !Array.isArray(vi.artifacts) || !vi.artifacts.length) return null;
  const arts = vi.artifacts.filter(a => a && typeof a.fileIdentifyingUrlPathSegment === 'string');
  if (!arts.length) return null;
  const pick = arts.slice().sort((a, b) => Math.abs((a.width || 0) - 200) - Math.abs((b.width || 0) - 200))[0];
  const url = vi.rootUrl + pick.fileIdentifyingUrlPathSegment;
  return /^https:\/\/media\.licdn\.com\//.test(url) ? url : null;
}

const distanceIn = v => { for (const [o] of walk(v)) for (const x of Object.values(o)) if (typeof x === 'string' && x in DISTANCE) return DISTANCE[x]; return null; };

// Companies in a profile response (the person's positions point at them): lower-cased name → { li, web }.
// Company entities carry their LinkedIn page (url / universalName) and sometimes their own website.
const COMPANY_URN = /^urn:li:fsd_company:/;
const liCompanyUrl = o => {
  const u = typeof o.url === 'string' && /^https:\/\/www\.linkedin\.com\/(company|school|showcase)\/[^/?#]+/.exec(o.url);
  return u ? u[0] : typeof o.universalName === 'string' && /^[\w%.-]+$/.test(o.universalName) ? 'https://www.linkedin.com/company/' + o.universalName : null;
};
const webUrl = v => typeof v === 'string' && /^https?:\/\//i.test(v) && !/linkedin\.com/i.test(v) ? v.replace(/^http:/i, 'https:') : null;
export function companiesOf(all) {
  const byUrn = new Map(), out = {};
  for (const o of all) if (typeof o.entityUrn === 'string' && COMPANY_URN.test(o.entityUrn)) byUrn.set(o.entityUrn, o);
  const add = (name, c) => {
    if (typeof name !== 'string' || !name.trim() || !c) return;
    const k = name.trim().toLowerCase(), li = liCompanyUrl(c), web = webUrl(c.websiteUrl || c.companyPageUrl || c.website);
    if ((li || web) && !out[k]) out[k] = { li, web };
  };
  for (const c of byUrn.values()) add(c.name, c);
  // Positions: { companyName, "*company": urn } or { companyName, company: {...} }.
  for (const o of all) if (typeof o.companyName === 'string') {
    const ref = o['*company'] || (typeof o.companyUrn === 'string' ? o.companyUrn : null);
    add(o.companyName, ref ? byUrn.get(ref) : (o.company && typeof o.company === 'object' ? o.company : null));
  }
  return Object.fromEntries(Object.entries(out).slice(0, 30));
}

// Follow only career collections attached to this profile, never other people's positions in `included`.
function careerOf(profile, all) {
  const byUrn = new Map(all.filter(o => typeof o.entityUrn === 'string').map(o => [o.entityUrn, o]));
  const seen = new Set(), positions = [];
  const text = value => typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : null;
  const visit = (value, company = null, explicitlyCurrent = false) => {
    if (typeof value === 'string') { if (byUrn.has(value)) visit(byUrn.get(value), company, explicitlyCurrent); return; }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) { value.forEach(v => visit(v, company, explicitlyCurrent)); return; }
    const ref = value['*company'] || value.companyUrn;
    const co = byUrn.get(ref) || (typeof value.company === 'object' ? value.company : null);
    const companyName = text(value.companyName) || text(co && co.name) || company;
    const period = value.timePeriod || value.dateRange;
    const current = value.current === true || value.isCurrent === true ||
      (value.current !== false && value.isCurrent !== false && !(period && period.endDate) &&
        (explicitlyCurrent || !!(period && period.startDate)));
    const title = text(value.title);
    if (current && (title || companyName) && (title || period || value.current === true || value.isCurrent === true)) {
      positions.push({ title, company: companyName, current: true, companyLinkedin: co ? liCompanyUrl(co) : null,
        domain: (() => { try { return new URL(webUrl(co && (co.websiteUrl || co.companyPageUrl || co.website))).hostname; } catch (_) { return null; } })() });
    }
    for (const [key, child] of Object.entries(value)) {
      if (/company|profilePicture|background|memberRelationship/i.test(key)) continue;
      if (typeof child === 'object' || key.startsWith('*')) visit(child, companyName, explicitlyCurrent);
    }
  };
  for (const [key, value] of Object.entries(profile)) if (/position|employment/i.test(key)) visit(value, null, /currentPosition/i.test(key));
  const unique = positions.filter((p, i) => positions.findIndex(q => q.title === p.title && q.company === p.company) === i).slice(0, 10);
  const primary = unique[0];
  return { headline: text(profile.headline), title: primary && primary.title || null, company: primary && primary.company || null,
    companyDomain: primary && primary.domain || null, positions: unique,
    location: text(profile.locationName) || text(profile.geoLocation && profile.geoLocation.geo && profile.geoLocation.geo.defaultLocalizedName) };
}

// dash profile → { photoUrl, connected, pending, distance, found, diag }. Only the profile being looked up counts:
// the response also carries other people (mutual connections, colleagues) with their own relationships and photos.
// Photo: a VectorImage under that profile's "profilePicture" (never the background). Relationship: its
// memberRelationship — inline, or (normalized responses) an entity in `included` referenced by URN.
export function parseDashProfile(json, slug) {
  const out = { photoUrl: null, connected: null, pending: null, distance: null, found: false, diag: null, companies: {}, profile: null };
  if (!json || typeof json !== 'object') return out;
  const all = [...walk(json)].map(([o]) => o);
  const want = String(slug || '').toLowerCase();
  const P = (want && all.find(o => typeof o.publicIdentifier === 'string' && o.publicIdentifier.toLowerCase() === want)) || (!want && all.find(o => o.profilePicture && typeof o.profilePicture === 'object'));
  if (!P) return out;
  for (const [o, path] of walk(P.profilePicture || {})) if (!out.photoUrl && o.rootUrl && !/background/i.test(path.join('.'))) out.photoUrl = vectorImageUrl(o);
  out.companies = companiesOf(all);
  out.profile = { linkedinUrl: want ? 'https://www.linkedin.com/in/' + encodeURIComponent(slug) : null, ...careerOf(P, all) };
  let R = null;
  const ref = P['*memberRelationship'] || (typeof P.memberRelationship === 'string' ? P.memberRelationship : null);
  if (P.memberRelationship && typeof P.memberRelationship === 'object') R = P.memberRelationship;
  else if (ref) R = all.find(o => o.entityUrn === ref) || null;
  // Some decorations (TopCardSupplementary) do not link the profile to its relationship at all: the entity is
  // still in `included`, keyed by the same member id as the profile (fsd_profile:ID ↔ fsd_memberRelationship:ID).
  const memberId = typeof P.entityUrn === 'string' ? (/^urn:li:fsd_profile:(.+)$/.exec(P.entityUrn) || [])[1] : null;
  if (!R && memberId) R = all.find(o => o.entityUrn === 'urn:li:fsd_memberRelationship:' + memberId) || null;
  const sampleCo = all.find(o => typeof o.entityUrn === 'string' && COMPANY_URN.test(o.entityUrn));
  out.diag = { keys: Object.keys(P).filter(k => /relation|distance|invit|connection|follow/i.test(k)).slice(0, 12), rel: R ? Object.keys(R).slice(0, 12) : null,
    companies: Object.keys(out.companies).length, coKeys: sampleCo ? Object.keys(sampleCo).filter(k => !k.startsWith('$')).slice(0, 15) : null };
  // A Connection entity for this member means 1st degree even when the relationship entity is missing or opaque.
  const connEntity = memberId && all.find(o => o.entityUrn === 'urn:li:fsd_connection:' + memberId || (o.connectedMember === P.entityUrn && /\.Connection$/.test(String(o.$type || ''))));
  if (!R) { if (connEntity) { out.found = true; out.connected = true; out.distance = 1; } return out; }
  out.found = true;
  const U = R.memberRelationshipUnion || R.memberRelationshipData || R.memberRelationship || R;
  if (U && typeof U === 'object') {
    // Normalized responses hold a 1st-degree connection as a URN link ("*connection"), not an inline object.
    if (U.connection || U['*connection']) out.connected = true;
    else if (U.noConnection || U['*noConnection'] || U.noInvitation) out.connected = false;
    if (U.self) out.distance = 'self';
  }
  if (out.connected == null && connEntity) out.connected = true;
  if (out.connected === true && out.distance == null) out.distance = 1;
  // Normalized responses link sub-entities by URN ("*invitation": "urn:li:fsd_invitation:…"): follow those links.
  const byUrn = new Map(all.filter(o => typeof o.entityUrn === 'string').map(o => [o.entityUrn, o]));
  const seen = new Set(); const parts = [];
  const collect = v => { if (!v || typeof v !== 'object' || seen.has(v)) return; seen.add(v); parts.push(v);
    for (const [o] of walk(v)) for (const [k, x] of Object.entries(o)) { if (k.startsWith('*') && typeof x === 'string' && byUrn.has(x)) collect(byUrn.get(x)); if (k.startsWith('*') && Array.isArray(x)) x.forEach(u => byUrn.has(u) && collect(byUrn.get(u))); } };
  collect(R);
  out.distance = out.distance || distanceIn(parts);
  for (const [o] of walk(parts)) {
    if (o.invitationState === 'PENDING' || (o.invitation && o.invitation.invitationState === 'PENDING')) out.pending = true;
    // An invitation union that holds an invitation (rather than `noInvitation`) means one is outstanding.
    const iu = o.invitationUnion; if (iu && typeof iu === 'object' && (iu.invitation || iu['*invitation'])) out.pending = true;
  }
  out.diag.parts = parts.slice(0, 6).map(o => ({ type: o.$type ? String(o.$type).split('.').pop() : null, keys: Object.keys(o).filter(k => !k.startsWith('$')).slice(0, 12),
    flags: [...walk(o)].flatMap(([x]) => Object.entries(x).filter(([k, v]) => /invit|state|distance/i.test(k) && (typeof v === 'string' || v === null || typeof v === 'object')).map(([k, v]) => k + '=' + (typeof v === 'string' ? v.slice(0, 40) : v === null ? 'null' : '{' + Object.keys(v).slice(0, 4).join(',') + '}'))).slice(0, 12) }));
  if (U && typeof U === 'object') out.diag.u = Object.fromEntries(Object.entries(U).filter(([, x]) => x && typeof x === 'object').map(([k, x]) => [k, Object.keys(x).slice(0, 10)]));
  return out;
}

// Combined, as the side panel shows it.
export function relationOf({ distance = null, connected = null, pending = null } = {}) {
  if (distance === 'self') return 'self';
  if (connected === true || distance === 1) return 'connected';
  if (pending) return 'pending';
  if (distance === 2 || distance === 3) return 'degree' + distance;
  if (distance === 'out') return 'out';
  return null;
}
