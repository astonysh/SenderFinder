// The LinkedIn invitation note: template + placeholders + optional signature, trimmed to LinkedIn's limit.
// Pure functions; used by the service worker and tested in Node.
export const NOTE_MAX = 200;  // LinkedIn's limit for a connection note (help article a563153, checked 2026-10-29)

// First name for the greeting: first token of a Latin name, the whole name for CJK.
export function firstNameOf(fullName) {
  if (typeof fullName !== 'string') return '';
  const s = fullName.trim().replace(/\s+/g, ' ');
  if (!s) return '';
  if (/[一-鿿぀-ヿ가-힯]/.test(s)) return s;
  const w = s.split(' ').filter(x => !/^(dr|prof|mr|mrs|ms|mx)\.?$/i.test(x));
  return w[0] || s.split(' ')[0];
}

// Fills {first} {name} {company}; a missing value removes the placeholder and tidies the punctuation around it.
export function fillTemplate(template, vars = {}) {
  const v = { first: vars.first || firstNameOf(vars.name) || '', name: vars.name || '', company: vars.company || '' };
  let s = String(template || '').replace(/\{(first|name|company)\}/g, (_, k) => v[k]);
  s = s.replace(/[ \t]*([,，、])[ \t]*(?=[,，、.。!！?？\n]|$)/g, '')   // dangling comma before punctuation / end
       .replace(/(^|\n)[ \t]*[,，、][ \t]*/g, '$1')                      // comma at line start
       .replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([,，。.!！?？])/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

// Returns the note to prefill. The signature is kept whole; the body is cut to fit.
export function composeNote({ template, vars, signature = '', max = NOTE_MAX } = {}) {
  const body = fillTemplate(template, vars);
  const sig = String(signature || '').trim();
  if (!sig) return body.length > max ? body.slice(0, max - 1).trimEnd() + '…' : body;
  const room = max - sig.length - 2; // "\n\n"
  if (room <= 0) return sig.slice(0, max);
  const b = body.length > room ? body.slice(0, room - 1).trimEnd() + '…' : body;
  return (b ? b + '\n\n' : '') + sig;
}
