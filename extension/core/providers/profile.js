// Turn any provider payload into one professional profile. Only professional
// fields leave this module: no phone numbers, no personal emails, no raw payloads.
import { normalizeLinkedInUrl } from '../identity.js';
import { guessTimeZone, isValidTimeZone } from '../geo.js';

export const str = (v, n = 300) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, n) : null);
const first = (...vals) => { for (const v of vals) { const s = str(v); if (s) return s; } return null; };

// A bare LinkedIn handle ("jane-doe-123"). Never all digits: numeric values under "linkedin" keys are ids
// (e.g. Apollo's organization.linkedin_uid "3039"), and /in/3039 is a 404.
const isHandle = v => /^[A-Za-z0-9\-_%~.]{3,}$/.test(v) && /[A-Za-z]/.test(v);
// Sub-objects about the employer, not the person: their LinkedIn fields point at the company.
const NOT_PERSON = /^(organization|organisation|company|companies|employer|account|current_employer|employment_history|org)$/i;

// Depth-first search for a LinkedIn person URL anywhere in the payload.
export function findLinkedIn(obj, depth = 0) {
  if (!obj || depth > 6) return null;
  if (typeof obj === 'string') return normalizeLinkedInUrl(obj);
  if (Array.isArray(obj)) { for (const x of obj) { const u = findLinkedIn(x, depth + 1); if (u) return u; } return null; }
  if (typeof obj !== 'object') return null;
  // Preferred keys first.
  for (const k of ['linkedin_url', 'linkedinUrl', 'linkedin', 'profile_url', 'profileUrl', 'url', 'handle', 'linkedin_handle']) {
    const v = obj[k];
    if (typeof v === 'string') {
      const u = normalizeLinkedInUrl(v) || (/^(handle|linkedin_handle)$/.test(k) && isHandle(v) ? normalizeLinkedInUrl('https://www.linkedin.com/in/' + v) : null);
      if (u) return u;
    } else if (v && typeof v === 'object') {
      const u = findLinkedIn(v, depth + 1); if (u) return u;
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (/phone|mobile|email|company_linked|company_url|organization_url/i.test(k)) continue;
    if (/^(network|type|name)$/.test(k) || NOT_PERSON.test(k)) continue;
    if (typeof v === 'string' && /linkedin/i.test(k) && !/(^|_)u?id$|uid|_num/i.test(k)) {
      // e.g. QuickEnrich employee_linkedin: a full URL or a bare handle.
      const u = normalizeLinkedInUrl(v) || (isHandle(v.trim()) ? normalizeLinkedInUrl('https://www.linkedin.com/in/' + v.trim()) : null);
      if (u) return u;
    }
    if (v && typeof v === 'object') { const u = findLinkedIn(v, depth + 1); if (u) return u; }
  }
  return null;
}

// Public https image URL or null. Data URLs and anything that is not http(s) are dropped.
export function imageUrl(v) {
  const s = str(v, 2000);
  if (!s || !/^https?:\/\//i.test(s)) return null;
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) && u.hostname ? u.href : null; } catch (_) { return null; }
}

// X / Twitter: accepts a profile URL or a bare handle; returns https://x.com/<handle> or null.
export function twitterUrl(v) {
  if (v && typeof v === 'object') v = v.url || v.handle || v.username || null;
  const s = str(v, 300);
  if (!s) return null;
  const m = /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/@?([A-Za-z0-9_]{1,15})(?:[/?#].*)?$/i.exec(s) || /^@?([A-Za-z0-9_]{1,15})$/.exec(s);
  if (!m) return null;
  const handle = m[1];
  if (/^(home|search|share|intent|i|explore|settings|login|signup|hashtag)$/i.test(handle)) return null;
  return 'https://x.com/' + handle;
}

// "https://www.Boomi.com/about" / "boomi.com" → "boomi.com"; anything that is not a plain public host → null.
export function domainOf(v) {
  if (!v) return null;
  let h; try { h = new URL(/^https?:\/\//i.test(v) ? v : 'https://' + v).hostname.toLowerCase(); } catch (_) { return null; }
  h = h.replace(/^www\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) && !/(^|\.)linkedin\.com$/.test(h) ? h : null;
}
// A LinkedIn company page URL, normalised; anything else → null.
export function companyLinkedIn(v) {
  const m = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.|www\.)?linkedin\.com\/(company|school|showcase)\/([^/?#]+)/i.exec(String(v || '').trim());
  return m ? `https://www.linkedin.com/${m[1].toLowerCase()}/${m[2]}` : null;
}

function positionsOf(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(x => x && typeof x === 'object').slice(0, 12).map(x => ({
    title: first(x.title, x.job_title, x.position, x.role, x.title && x.title.cleaned),
    company: first(x.company_name, x.organization_name, x.company && (x.company.name || x.company), x.organization && (x.organization.name || x.organization.name?.cleaned), x.company, x.employer),
    current: x.current === true || x.is_current === true || x.job_is_current === true || (x.end_date == null && x.end_at == null && (x.start_date || x.start_at) ? true : false),
    // Where the company lives on the web, when the provider says so (Apollo's history usually does not).
    domain: domainOf(first(x.company_domain, x.domain, x.company_website, x.website, x.organization && (x.organization.primary_domain || x.organization.website_url), x.company && typeof x.company === 'object' && (x.company.domain || x.company.website || x.company.website_url))),
    companyLinkedin: companyLinkedIn(first(x.company_linkedin_url, x.organization_linkedin_url, x.organization && x.organization.linkedin_url, x.company && typeof x.company === 'object' && x.company.linkedin_url)),
  })).filter(p => p.title || p.company).slice(0, 8);
}

// person: the provider's person object (already unwrapped). Returns null when there is nothing usable.
export function normalizeProfile(person, { provider } = {}) {
  if (!person || typeof person !== 'object') return null;
  const p = person;
  const emp = p.employment || p.current_employment || p.job || {};
  const org = p.organization || p.company || emp.company || {};
  const name = first(p.full_name, p.fullName, p.name && typeof p.name === 'object' ? p.name.fullName || p.name.full_name : p.name,
    [p.first_name || p.firstName || p.given_name, p.last_name || p.lastName || p.family_name].filter(Boolean).join(' '));
  const positions = positionsOf(p.employment_history || p.experiences || p.experience || p.positions || (emp.all) || []);
  const current = positions.find(x => x.current) || null;
  const profile = {
    linkedinUrl: findLinkedIn(p),
    fullName: name,
    headline: first(p.headline && (p.headline.cleaned || p.headline), p.summary && typeof p.summary === 'string' && p.summary.length < 200 ? p.summary : null),
    title: first(p.title, p.job_title, emp.title, emp.position, p.position, current && current.title),
    company: first(org.name && (org.name.cleaned || org.name), typeof org === 'string' ? org : null, p.company_name, emp.name, emp.company_name, p.organization_name, current && current.company),
    companyDomain: first(org.primary_domain, org.domain, p.company_domain, emp.domain, emp.company_domain, org.website_url && (() => { try { return new URL(org.website_url).hostname.replace(/^www\./, ''); } catch (_) { return null; } })()),
    location: first(typeof p.location === 'string' ? p.location : p.location && [p.location.city, p.location.state, p.location.country].filter(Boolean).join(', '),
      [p.city, p.state, p.country].filter(Boolean).join(', ')),
    positions,
    photoUrl: imageUrl(p.photo_url || p.photoUrl || p.avatar || p.avatar_url || p.profile_pic_url || p.profile_picture || p.profile_image_url || p.picture || p.image_url || p.image),
    twitterUrl: twitterUrl(p.twitter_url || p.twitterUrl || p.twitter || p.twitter_handle || p.twitter_username),
    timeZone: null,
    provider: provider || null,
  };
  const tz = first(p.timeZone, p.time_zone, p.timezone);
  profile.timeZone = tz && isValidTimeZone(tz) ? tz : guessTimeZone(profile.location);
  if (!profile.linkedinUrl && !profile.fullName && !profile.title && !profile.company) return null;
  return profile;
}

