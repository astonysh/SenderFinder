// Names, email addresses and LinkedIn URLs: normalisation and matching. Runs in the browser and in Node.

export const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.de', 'ymail.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'protonmail.com', 'proton.me', 'pm.me', 'gmx.de', 'gmx.net', 'gmx.com', 'web.de', 't-online.de', 'mail.com', 'zoho.com',
  'fastmail.com', 'yandex.ru', 'yandex.com', 'mail.ru', 'qq.com', 'foxmail.com', '163.com', '126.com', 'yeah.net', 'sina.com', 'sina.cn', 'sohu.com', 'aliyun.com', '139.com',
  '189.cn', 'naver.com', 'daum.net', 'hanmail.net', 'rediffmail.com', 'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'btinternet.com', 'orange.fr', 'wanadoo.fr',
  'free.fr', 'libero.it', 'tutanota.com', 'hey.com', 'duck.com']);

// Display names that are not a person.
const NOT_A_PERSON = /\b(team|support|info|sales|noreply|no-reply|newsletter|notification|billing|hello|contact|admin|service|marketing|office|hr|careers|jobs|press|news|help|mail|inc|llc|ltd|gmbh|ag|co|corp|company|group|limited|technologies|solutions|studio|labs?)\b/i;

const ROLE_LOCAL = /^(info|support|sales|hello|contact|admin|office|team|hr|jobs|careers|press|billing|noreply|no-reply|newsletter|marketing|help|service|mail|postmaster|webmaster|abuse|security|privacy|legal|accounts?|invoice|orders?|notifications?|do-not-reply|donotreply|bounce|mailer-daemon)$/i;

export function normalizeEmail(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase().replace(/^mailto:/, '').replace(/^<|>$/g, '');
  if (!/^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s) || s.length > 254) return null;
  return s;
}
export const domainOf = email => (email && email.includes('@') ? email.split('@')[1] : null);
export const isFreeMail = email => FREE_MAIL.has(domainOf(email) || '');
export const isRoleAddress = email => ROLE_LOCAL.test((email || '').split('@')[0] || '');

// Remove accents, quotes, punctuation; lower case; collapse spaces.
export function nameWords(name) {
  if (typeof name !== 'string') return [];
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/["“”‘’'`´()\[\]{}|/\\*_~<>]/g, ' ')
    .replace(/\b(dr|prof|mr|mrs|ms|mx|sir|phd|mba|jr|sr|ii|iii)\.?\b/gi, ' ')
    .toLowerCase().split(/[\s,.;:+&-]+/).filter(w => w && /[a-zÀ-ɏЀ-ӿ一-鿿]/.test(w));
}

// Clean a display name from a mail header. Returns null when it does not look like a person.
export function cleanDisplayName(name, email) {
  if (typeof name !== 'string') return null;
  let s = name.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ');
  if (!s) return null;
  if (normalizeEmail(s)) return null;                       // display name is the address itself
  if (s.includes('@')) s = s.replace(/<?[^\s<>]+@[^\s<>]+>?/g, '').trim();
  s = s.replace(/\s*\((?:via|через|通过)[^)]*\)\s*$/i, '').replace(/\s+via\s+.+$/i, '').trim();
  if (/\s[|–—-]\s|\s*\|\s*/.test(s)) { const head = s.split(/\s*[|–—]\s*|\s-\s/)[0].trim(); if (nameWords(head).length >= 2) s = head; } // "Jane Doe | Acme GmbH"
  if (/^[^,]+,\s*[^,]+$/.test(s) && nameWords(s).length === 2) { const [a, b] = s.split(',').map(x => x.trim()); s = `${b} ${a}`; } // "Doe, Jane"
  const words = nameWords(s);
  if (!words.length || words.length > 5) return null;
  if (words.some(w => NOT_A_PERSON.test(w))) return null;      // 'Acme Support', 'Sales Team', 'Acme GmbH'
  if (/[一-鿿]/.test(s)) return s.length <= 6 ? s : null;  // CJK names are short
  return s;
}

// Guess first/last from the local part: jane.doe / jane_doe / jdoe (initial + surname).
export function nameHintFromEmail(email) {
  const local = (email || '').split('@')[0].replace(/\+.*$/, '');
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 2 && parts.every(p => /^[a-z]{2,}$/i.test(p))) return { first: parts[0], last: parts[1] };
  return null;
}

// Does the candidate's name match the name we were given?
// true: first and last both present; false: clear mismatch; null: cannot tell.
export function nameMatches(given, candidate) {
  const g = nameWords(given), c = nameWords(candidate);
  if (!g.length || !c.length) return null;
  if (/[一-鿿]/.test(given) || /[一-鿿]/.test(candidate)) return given.replace(/\s/g, '') === candidate.replace(/\s/g, '');
  const cset = new Set(c);
  const gLast = g[g.length - 1], gFirst = g[0];
  const lastOk = cset.has(gLast) || c.some(w => w.length > 3 && gLast.length > 3 && (w.startsWith(gLast) || gLast.startsWith(w)));
  const firstOk = cset.has(gFirst) || c.some(w => w.startsWith(gFirst) || gFirst.startsWith(w)) || (gFirst.length <= 2 && c.some(w => w[0] === gFirst[0]));
  if (g.length === 1) return cset.has(g[0]) ? null : (c.some(w => w.startsWith(g[0])) ? null : false);
  if (lastOk && firstOk) return true;
  if (!lastOk && !firstOk) return false;
  return lastOk ? null : false;
}

// https://www.linkedin.com/in/<slug>  (country subdomains and query strings removed)
export function normalizeLinkedInUrl(v) {
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/\//, '');
  let u;
  try { u = new URL(s); } catch (_) { return null; }
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
  const m = /^\/(?:in|pub)\/([^/?#]+)/i.exec(decodeURIComponent(u.pathname));
  if (!m) return null;
  const slug = m[1].replace(/\/+$/, '');
  if (!slug || /^(unavailable|edit|me)$/i.test(slug)) return null;
  return `https://www.linkedin.com/in/${slug}`;
}
export const linkedInHandle = url => { const n = normalizeLinkedInUrl(url); return n ? n.slice('https://www.linkedin.com/in/'.length) : null; };

