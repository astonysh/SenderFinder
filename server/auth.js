'use strict';
const crypto = require('crypto');

function tokenOk(header, expected) {
  if (!expected || expected.length < 16) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header || '');
  if (!m) return false;
  const a = Buffer.from(m[1].trim()), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Simple fixed-window rate limiter per key.
function createRateLimiter({ now = () => Date.now() } = {}) {
  const hits = new Map();
  return function allow(key, limit, windowMs = 60000) {
    const t = now();
    const h = hits.get(key);
    if (!h || t - h.start >= windowMs) { hits.set(key, { start: t, n: 1 }); return true; }
    h.n += 1;
    return h.n <= limit;
  };
}

module.exports = { tokenOk, createRateLimiter };
