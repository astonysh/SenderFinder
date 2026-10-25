'use strict';
// Turn any provider payload into one professional profile. Only professional
// fields leave this module: no phone numbers, no personal emails, no raw payloads.
const { normalizeLinkedInUrl } = require('../identity');

const str = (v, n = 300) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, n) : null);
const first = (...vals) => { for (const v of vals) { const s = str(v); if (s) return s; } return null; };

// Depth-first search for a LinkedIn person URL anywhere in the payload.
function findLinkedIn(obj, depth = 0) {
  if (!obj || depth > 6) return null;
  if (typeof obj === 'string') return normalizeLinkedInUrl(obj);
  if (Array.isArray(obj)) { for (const x of obj) { const u = findLinkedIn(x, depth + 1); if (u) return u; } return null; }
  if (typeof obj !== 'object') return null;
  // Preferred keys first.
  for (const k of ['linkedin_url', 'linkedinUrl', 'linkedin', 'profile_url', 'profileUrl', 'url', 'handle', 'linkedin_handle']) {
    const v = obj[k];
    if (typeof v === 'string') {
      const u = normalizeLinkedInUrl(v) || (/^(handle|linkedin_handle)$/.test(k) && /^[A-Za-z0-9\-_%~.]{3,}$/.test(v) ? normalizeLinkedInUrl('https://www.linkedin.com/in/' + v) : null);
      if (u) return u;
    } else if (v && typeof v === 'object') {
      const u = findLinkedIn(v, depth + 1); if (u) return u;
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (/phone|mobile|email|company_linked|company_url|organization_url/i.test(k)) continue;
    if (/^(network|type|name)$/.test(k)) continue;
    if (typeof v === 'string' && /linkedin/i.test(k)) {
      // e.g. QuickEnrich employee_linkedin: a full URL or a bare handle.
      const u = normalizeLinkedInUrl(v) || (/^[A-Za-z0-9\-_%~.]{3,}$/.test(v.trim()) ? normalizeLinkedInUrl('https://www.linkedin.com/in/' + v.trim()) : null);
      if (u) return u;
    }
    if (v && typeof v === 'object') { const u = findLinkedIn(v, depth + 1); if (u) return u; }
  }
  return null;
}

function positionsOf(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(x => x && typeof x === 'object').slice(0, 12).map(x => ({
    title: first(x.title, x.job_title, x.position, x.role, x.title && x.title.cleaned),
    company: first(x.company_name, x.organization_name, x.company && (x.company.name || x.company), x.organization && (x.organization.name || x.organization.name?.cleaned), x.company, x.employer),
    current: x.current === true || x.is_current === true || x.job_is_current === true || (x.end_date == null && x.end_at == null && (x.start_date || x.start_at) ? true : false),
  })).filter(p => p.title || p.company).slice(0, 8);
}

// person: the provider's person object (already unwrapped). Returns null when there is nothing usable.
function normalizeProfile(person, { provider } = {}) {
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
    provider: provider || null,
  };
  if (!profile.linkedinUrl && !profile.fullName && !profile.title && !profile.company) return null;
  return profile;
}

module.exports = { normalizeProfile, findLinkedIn, str };
