// Fill professional fields only; a known profile link must never be replaced by an enrichment result.
import { normalizeLinkedInUrl } from './identity.js';
export function mergeProfileDetails(profile, details) {
  if (!profile || !details) return profile;
  const url = normalizeLinkedInUrl(profile.linkedinUrl);
  if (!url || (details.linkedinUrl && normalizeLinkedInUrl(details.linkedinUrl)?.toLowerCase() !== url.toLowerCase())) return profile;
  const out = { ...profile };
  for (const key of ['fullName', 'headline', 'title', 'company', 'location', 'photoUrl', 'timeZone']) {
    if (!out[key] && typeof details[key] === 'string' && details[key].trim()) out[key] = details[key].trim().slice(0, key === 'photoUrl' ? 2000 : 500);
  }
  if (!profile.company && out.company) out.companyDomain = details.companyDomain || null;
  if (!(out.positions || []).length && Array.isArray(details.positions)) out.positions = details.positions.slice(0, 10);
  return out;
}
