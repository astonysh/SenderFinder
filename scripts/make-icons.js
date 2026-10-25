// Derives the extension icons and the website logo from the masters in design/:
//   icon-1024.png     → icon48.png, icon128.png, site/assets/logo.png
//   icon-small-32.png → icon16.png (a simplified, pixel-aligned redraw; the big mark turns to mush at 16 px)
// Pure Node, no dependencies: decodes the PNGs (8-bit RGBA, non-interlaced), box-filters them down, re-encodes.
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.join(__dirname, '..');
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, w = 0, h = 0, idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error('master must be 8-bit RGBA, non-interlaced'); }
    else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * 4, px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? px[dst + i - 4] : 0, b = y > 0 ? px[dst - stride + i] : 0, c = y > 0 && i >= 4 ? px[dst - stride + i - 4] : 0, x = raw[src + i];
      let v;
      if (f === 0) v = x; else if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1);
      else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      px[dst + i] = v & 255;
    }
  }
  return { w, h, px };
}
function encodePng(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// Area-averaging downsample with premultiplied alpha, so transparent corners do not bleed dark fringes.
function resize(img, size) {
  const out = Buffer.alloc(size * size * 4), sx = img.w / size, sy = img.h / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const x0 = Math.floor(x * sx), x1 = Math.ceil((x + 1) * sx), y0 = Math.floor(y * sy), y1 = Math.ceil((y + 1) * sy);
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const o = (yy * img.w + xx) * 4, al = img.px[o + 3] / 255; r += img.px[o] * al; g += img.px[o + 1] * al; b += img.px[o + 2] * al; a += al; n++; }
    const o = (y * size + x) * 4; if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); } out[o + 3] = Math.round(255 * a / n);
  }
  return out;
}
const master = decodePng(fs.readFileSync(path.join(ROOT, 'design', 'icon-1024.png')));
const small = decodePng(fs.readFileSync(path.join(ROOT, 'design', 'icon-small-32.png')));
const iconDir = path.join(ROOT, 'extension', 'icons'); fs.mkdirSync(iconDir, { recursive: true });
fs.writeFileSync(path.join(iconDir, 'icon16.png'), encodePng(16, 16, resize(small, 16)));
for (const s of [48, 128]) fs.writeFileSync(path.join(iconDir, `icon${s}.png`), encodePng(s, s, resize(master, s)));
fs.writeFileSync(path.join(ROOT, 'site', 'assets', 'logo.png'), encodePng(128, 128, resize(master, 128)));
console.log('icons written to', iconDir, 'and site/assets/logo.png');
