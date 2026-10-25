// Last-resort step: a web search for the person's name + company, restricted to linkedin.com. Reverse-email
// providers only know addresses already in their databases; a new company or a new hire is often missing there
// while the public LinkedIn page (title "Jane Doe - Head of Growth at Acme") is indexed by search engines.
// Pure functions here; the fetching (Firecrawl search) lives in providers/firecrawl.js, the budget in waterfall.js.
import { nameMatches, normalizeLinkedInUrl } from './identity.js';

// "acme" from "acme.com" / "mail.acme.co.uk" (the last label before the public suffix, roughly: the longest label
// that is not a known generic one). Good enough as a search keyword and as evidence in a result title.
const GENERIC = new Set(['www', 'mail', 'com', 'net', 'org', 'io', 'ai', 'co', 'uk', 'de', 'fr', 'cn', 'jp', 'app', 'dev', 'inc', 'ltd', 'group', 'email']);
export function companyKeyword(domain) {
  const labels = String(domain || '').toLowerCase().split('.').filter(Boolean);
  const cands = labels.filter(l => !GENERIC.has(l));
  const k = (cands.length ? cands : labels).sort((a, b) => b.length - a.length)[0] || null;
  return k && k.length >= 2 ? k : null;
}

export function searchQuery({ name, domain }) {
  const k = companyKeyword(domain);
  return name && k ? `"${name}" ${k}` : null;
}

// Profile URL from a result URL: /in/<slug> directly, or the author of a /posts/<slug>_... page.
export function profileUrlOf(url) {
  const direct = normalizeLinkedInUrl(url);
  if (direct) return direct;
  const m = /^https?:\/\/(?:[a-z]{2,3}\.|www\.)?linkedin\.com\/posts\/([^/_?#]+)_/i.exec(String(url || ''));
  return m ? normalizeLinkedInUrl('https://www.linkedin.com/in/' + m[1]) : null;
}

// Title "Jane Doe - Head of Growth at Acme - LinkedIn" -> { fullName, headline, title, company }.
export function parseTitle(title) {
  const parts = String(title || '').split(/\s+[-–|]\s+/).map(s => s.trim()).filter(Boolean);
  if (parts.length && /^linkedin$/i.test(parts[parts.length - 1])) parts.pop();
  if (!parts.length) return null;
  const fullName = parts[0].replace(/\s+posted this$/i, '').replace(/\s+on LinkedIn$/i, '').trim();
  const headline = parts.slice(1).join(' - ') || null;
  const at = headline ? /^(.+?)\s+(?:at|@|bei|chez|en|presso|em)\s+(.+)$/i.exec(headline) : null;
  return { fullName, headline, title: at ? at[1].trim() : null, company: at ? at[2].trim() : null };
}

// The first result that is a LinkedIn profile (or a post by one), whose title names the person and whose text
// mentions the company keyword. Returns the profile or null.
export function pickProfile(results, { name, domain, provider = 'firecrawl:search' } = {}) {
  const k = companyKeyword(domain);
  if (!name || !k || !Array.isArray(results)) return null;
  const ranked = results.map((r, i) => ({ r, i, direct: !!normalizeLinkedInUrl(r && r.url) })).sort((a, b) => Number(b.direct) - Number(a.direct) || a.i - b.i);
  for (const { r, direct } of ranked) {
    const url = profileUrlOf(r && r.url);
    if (!url) continue;
    const t = parseTitle(r.title);
    if (!t || nameMatches(name, t.fullName) !== true) continue;
    const text = (String(r.title || '') + ' ' + String(r.description || '')).toLowerCase();
    if (!text.includes(k)) continue;
    return { linkedinUrl: url, fullName: t.fullName, headline: direct ? t.headline : null, title: direct ? t.title : null, company: direct ? t.company : null,
      companyDomain: domain, location: null, positions: [], photoUrl: null, twitterUrl: null, provider };
  }
  return null;
}
