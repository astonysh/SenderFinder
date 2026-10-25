'use strict';
// HTTP server: JSON API under /api, static web app under /. No dependencies.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { config } = require('./config');
const { createStore } = require('./db');
const { tokenOk, createRateLimiter } = require('./auth');
const { createMonidClient } = require('./providers/monid');
const { createTregClient } = require('./providers/treg');
const { createFirecrawlClient } = require('./providers/firecrawl');
const { createLookup } = require('./waterfall');
const { normalizeEmail } = require('./identity');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.map': 'application/json' };

class HttpError extends Error { constructor(status, code, message) { super(message || code); this.status = status; this.code = code; } }

function createApp({ store, lookupService, appToken, webDir, log = console.log, version = config.version, providers }) {
  const allow = createRateLimiter();

  function cors(req, res) {
    const origin = req.headers.origin || '';
    // Extensions, and the web app when it is opened from another local port or from disk during development.
    const local = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(origin) || (origin === 'null' && process.env.DEV_ALLOW_FILE_ORIGIN === 'true');
    if (/^chrome-extension:\/\/[a-p]{32}$/.test(origin) || /^moz-extension:\/\//.test(origin) || local) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
  }
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const readBody = req => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 1_000_000) { reject(new HttpError(413, 'BODY_TOO_LARGE')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (_) { reject(new HttpError(400, 'INVALID_JSON')); } });
    req.on('error', reject);
  });

  async function api(req, res, url) {
    const p = url.pathname;
    if (req.method === 'GET' && p === '/api/health') {
      return json(res, 200, { ok: true, version, providers: { monid: providers.monid.isConfigured(), treg: providers.treg.isConfigured(), firecrawl: providers.firecrawl.isConfigured() }, steps: lookupService.steps().filter(s => s.enabled).map(s => s.id) });
    }
    if (!tokenOk(req.headers.authorization, appToken)) throw new HttpError(401, 'UNAUTHORIZED', '令牌无效或缺失');
    const ip = req.socket.remoteAddress || 'local';

    if (req.method === 'POST' && p === '/api/lookup') {
      if (!allow(ip + ':lookup', 60)) throw new HttpError(429, 'RATE_LIMITED');
      const body = await readBody(req);
      const r = await lookupService.lookup({ email: body.email, name: body.name, domain: body.domain, signature: body.signature, source: String(body.source || 'api').slice(0, 20), force: body.force === true, maxUsd: body.maxUsd });
      return json(res, 200, r);
    }
    if (req.method === 'POST' && p === '/api/lookup/batch') {
      if (!allow(ip + ':batch', 5)) throw new HttpError(429, 'RATE_LIMITED');
      const body = await readBody(req);
      const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
      if (!items.length) throw new HttpError(400, 'NO_ITEMS');
      const results = [];
      for (const it of items) {
        try { results.push(await lookupService.lookup({ email: it && it.email, name: it && it.name, source: 'web', force: it && it.force === true })); }
        catch (e) { results.push({ ok: false, email: it && it.email, error: e.code || 'ERROR', message: e.message }); }
      }
      return json(res, 200, { ok: true, results });
    }
    if (req.method === 'GET' && p === '/api/lookups') {
      const r = store.listLookups({ limit: Number(url.searchParams.get('limit')) || 50, offset: Number(url.searchParams.get('offset')) || 0, q: (url.searchParams.get('q') || '').slice(0, 100), status: (url.searchParams.get('status') || '').slice(0, 20) });
      return json(res, 200, { ok: true, total: r.total, items: r.items });
    }
    if (req.method === 'DELETE' && p.startsWith('/api/lookups/')) {
      const email = normalizeEmail(decodeURIComponent(p.slice('/api/lookups/'.length)));
      if (!email) throw new HttpError(400, 'INVALID_EMAIL');
      return json(res, 200, { ok: true, removed: store.deleteLookup(email) });
    }
    if (req.method === 'GET' && p === '/api/stats') {
      const s = store.stats();
      return json(res, 200, { ok: true, ...s, budget: { dailyCapUsd: config.dailyCapUsd, spentTodayUsd: store.spentToday(), lookupMaxUsd: config.lookupMaxUsd } });
    }
    if (req.method === 'GET' && p === '/api/steps') return json(res, 200, { ok: true, steps: lookupService.steps() });
    throw new HttpError(404, 'NOT_FOUND');
  }

  function serveStatic(req, res, url) {
    if (!webDir) return json(res, 404, { ok: false, error: 'NOT_FOUND' });
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || !path.extname(rel)) rel = '/index.html';
    const file = path.normalize(path.join(webDir, rel));
    if (!file.startsWith(webDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': rel === '/index.html' ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url);
      throw new HttpError(405, 'METHOD_NOT_ALLOWED');
    } catch (e) {
      const status = e.status || e.http || (e.code === 'INVALID_EMAIL' ? 400 : 500);
      if (status >= 500) log('error', e && e.stack || e);
      return json(res, status, { ok: false, error: e.code || 'ERROR', message: status >= 500 ? '服务器内部错误' : e.message });
    }
  };
}

function start() {
  if (!config.appToken || config.appToken.length < 16) { console.error('APP_TOKEN 未设置或太短（至少 16 位）。运行 npm run token 生成一个并写入 .env'); process.exit(1); }
  const store = createStore({ file: config.dbPath, timeZone: config.timezone });
  const monid = createMonidClient({ apiKey: config.keys.monid });
  const treg = createTregClient({ token: config.keys.treg });
  const firecrawl = createFirecrawlClient({ apiKey: config.keys.firecrawl });
  const lookupService = createLookup({ store, config, monid, treg, firecrawl, log: console.log });
  const webDir = path.join(config.root, 'web');
  const handler = createApp({ store, lookupService, appToken: config.appToken, webDir: fs.existsSync(webDir) ? webDir : null, providers: { monid, treg, firecrawl } });
  const server = http.createServer(handler);
  server.listen(config.port, config.host, () => {
    console.log(`email-linkedin ${config.version} listening on http://${config.host}:${config.port}`);
    console.log(`providers: monid=${monid.isConfigured()} treg=${treg.isConfigured()} firecrawl=${firecrawl.isConfigured()} | steps: ${lookupService.steps().map(s => s.id + (s.enabled ? '' : '(off)')).join(' → ')}`);
    console.log(`budget: ${config.lookupMaxUsd} USD per lookup, ${config.dailyCapUsd} USD per day`);
  });
  const stop = () => { server.close(); store.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  return server;
}

if (require.main === module) start();
module.exports = { createApp, HttpError };
