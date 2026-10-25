'use strict';
// Generates the extension icons (PNG, no dependencies): indigo rounded square with a white "in"-style mark.
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = size * 0.22, s = size;
  const inRound = (x, y) => { const cx = Math.min(Math.max(x, r), s - r), cy = Math.min(Math.max(y, r), s - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; };
  const mark = (x, y) => { // "i" dot + stem, and an "n" arch, drawn in unit coordinates
    const u = x / s, v = y / s;
    if (u > 0.22 && u < 0.36 && v > 0.42 && v < 0.78) return true;            // i stem
    if ((u - 0.29) ** 2 + (v - 0.3) ** 2 < 0.075 ** 2) return true;            // i dot
    if (u > 0.44 && u < 0.58 && v > 0.42 && v < 0.78) return true;            // n left stem
    if (u > 0.66 && u < 0.8 && v > 0.56 && v < 0.78) return true;             // n right stem
    const dx = u - 0.62, dy = v - 0.56; const d = Math.sqrt(dx * dx + dy * dy); // n arch
    return v <= 0.56 && d >= 0.04 && d <= 0.18 && u >= 0.44;
  };
  for (let y = 0; y < s; y++) { raw[y * (s * 4 + 1)] = 0; for (let x = 0; x < s; x++) { const o = y * (s * 4 + 1) + 1 + x * 4; if (!inRound(x + 0.5, y + 0.5)) { raw.fill(0, o, o + 4); continue; } const m = mark(x + 0.5, y + 0.5); raw[o] = m ? 255 : 79; raw[o + 1] = m ? 255 : 70; raw[o + 2] = m ? 255 : 229; raw[o + 3] = 255; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(s, 0); ihdr.writeUInt32BE(s, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const dir = path.join(__dirname, '..', 'extension', 'icons'); fs.mkdirSync(dir, { recursive: true });
for (const s of [16, 48, 128]) fs.writeFileSync(path.join(dir, `icon${s}.png`), png(s));
console.log('icons written to', dir);
