// Free step: LinkedIn links inside the mail body / signature.
import { normalizeLinkedInUrl } from './identity.js';

const LINK = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9\-_%~.]+\/?/gi;

// Returns the profile URLs found, most frequent first. Company pages are ignored.
export function extractLinkedInUrls(text) {
  if (typeof text !== 'string' || !text) return [];
  const counts = new Map();
  for (const m of text.slice(0, 200000).match(LINK) || []) {
    const u = normalizeLinkedInUrl(m);
    if (u) counts.set(u, (counts.get(u) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
}

// The signature block is usually after the last "--", "Best regards", "Mit freundlichen Grüßen", "此致" etc.
export function signatureBlock(text) {
  if (typeof text !== 'string') return '';
  const t = text.slice(0, 200000);
  const markers = [/\n--\s*\n/, /\n(?:best|kind|warm)?\s*regards[,.!]?\s*\n/i, /\n(?:thanks|thank you|cheers|sincerely|best)[,.!]?\s*\n/i, /\n(?:mit freundlichen gr[üu][ßs]en|viele gr[üu][ßs]e|beste gr[üu][ßs]e|cordialement|saludos|祝好|此致|敬礼|谢谢)[,.!]?\s*\n/i];
  let best = -1;
  for (const re of markers) { const m = re.exec(t); if (m && m.index > best) best = m.index; }
  return best >= 0 ? t.slice(best) : t.slice(-1500);
}

