// Local storage for lookups (the cache / history), the spend ledger and per-provider totals.
// One implementation over a tiny key-value backend: IndexedDB in the extension, Maps in tests.
//
// backend = { get(store, key), put(store, value), delete(store, key), getAll(store), clear(store) }  (all async)
// stores:  'lookups' (key: email) · 'ledger' (key: day, YYYY-MM-DD) · 'providers' (key: provider id)

export const STORES = ['lookups', 'ledger', 'providers'];

export function dayOf(date, timeZone) {
  // YYYY-MM-DD in the budget time zone (default: the browser's / process's local zone).
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function memoryBackend(initial = {}) {
  const maps = Object.fromEntries(STORES.map(s => [s, new Map(Object.entries(initial[s] || {}))]));
  const key = (store, v) => (store === 'lookups' ? v.email : store === 'ledger' ? v.day : v.provider);
  return {
    async get(store, k) { return maps[store].get(k) ?? null; },
    async put(store, v) { maps[store].set(key(store, v), structuredClone(v)); },
    async delete(store, k) { return maps[store].delete(k); },
    async getAll(store) { return [...maps[store].values()].map(v => structuredClone(v)); },
    async clear(store) { maps[store].clear(); },
    async close() {},
  };
}

export function idbBackend({ name = 'senderfinder', version = 1, indexedDB: idb = globalThis.indexedDB } = {}) {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((resolve, reject) => {
    const req = idb.open(name, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('lookups')) db.createObjectStore('lookups', { keyPath: 'email' }).createIndex('lookedUpAt', 'lookedUpAt');
      if (!db.objectStoreNames.contains('ledger')) db.createObjectStore('ledger', { keyPath: 'day' });
      if (!db.objectStoreNames.contains('providers')) db.createObjectStore('providers', { keyPath: 'provider' });
    };
    req.onsuccess = () => { req.result.onversionchange = () => { req.result.close(); dbp = null; }; resolve(req.result); };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IDB_BLOCKED'));
  }));
  const run = (store, mode, fn) => open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const r = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(r.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IDB_ABORTED'));
  }));
  return {
    get: (store, k) => run(store, 'readonly', os => os.get(k)).then(v => v ?? null),
    put: (store, v) => run(store, 'readwrite', os => os.put(v)).then(() => undefined),
    delete: (store, k) => run(store, 'readonly', os => os.count(k)).then(n => run(store, 'readwrite', os => os.delete(k)).then(() => n > 0)),
    getAll: store => run(store, 'readonly', os => os.getAll()),
    clear: store => run(store, 'readwrite', os => os.clear()).then(() => undefined),
    async close() { if (dbp) { const db = await dbp; db.close(); dbp = null; } },
  };
}

const round = n => Math.round((Number(n) || 0) * 1e6) / 1e6;

export function createStore({ backend, now = () => new Date(), timeZone, maxEntries = 5000, maxAgeDays = 90 } = {}) {
  const b = backend || memoryBackend();
  const today = () => dayOf(now(), timeZone);
  const norm = rec => rec && ({
    email: rec.email, status: rec.status, nameGiven: rec.nameGiven || null, source: rec.source || null,
    profile: rec.profile || null, match: rec.match || null,
    cost: { usd: round(rec.cost && rec.cost.usd), calls: (rec.cost && rec.cost.calls) || [] },
    skippedReason: rec.skippedReason || null, lookedUpAt: rec.lookedUpAt, createdAt: rec.createdAt || rec.lookedUpAt,
  });

  let writes = 0;
  async function pruneIfNeeded() {
    if (++writes % 50 !== 0) return 0;
    return prune();
  }
  async function prune() {
    const all = await b.getAll('lookups');
    const cutoff = new Date(now().getTime() - maxAgeDays * 86400000).toISOString();
    const stale = all.filter(r => (r.lookedUpAt || '') < cutoff);
    const kept = all.filter(r => (r.lookedUpAt || '') >= cutoff).sort((x, y) => (x.lookedUpAt < y.lookedUpAt ? 1 : -1));
    const extra = kept.slice(maxEntries);
    for (const r of stale.concat(extra)) await b.delete('lookups', r.email);
    const days = await b.getAll('ledger');
    const dayCutoff = dayOf(new Date(now().getTime() - 400 * 86400000), timeZone);
    for (const d of days) if (d.day < dayCutoff) await b.delete('ledger', d.day);
    return stale.length + extra.length;
  }

  return {
    backend: b,
    async getLookup(email) { return norm(await b.get('lookups', email)); },
    async saveLookup(rec) {
      const at = rec.lookedUpAt || now().toISOString();
      const existing = await b.get('lookups', rec.email);
      const row = { ...norm({ ...rec, lookedUpAt: at }), createdAt: existing ? existing.createdAt : at };
      await b.put('lookups', row);
      await pruneIfNeeded();
      return row;
    },
    async deleteLookup(email) { return (await b.delete('lookups', email)) ? 1 : 0; },
    async recordCall({ step, provider, status, usd = 0, billing = 'reported', ms = 0 }) {
      const day = today();
      const d = (await b.get('ledger', day)) || { day, usd: 0, calls: 0, hits: 0 };
      d.usd = round(d.usd + (Number(usd) || 0)); d.calls += 1; if (status === 'hit') d.hits += 1;
      await b.put('ledger', d);
      if (provider && provider !== 'local') {
        const p = (await b.get('providers', provider)) || { provider, calls: 0, hits: 0, errors: 0, usd: 0, ms: 0 };
        p.calls += 1; if (status === 'hit') p.hits += 1; if (status === 'error') p.errors += 1; p.usd = round(p.usd + (Number(usd) || 0)); p.ms += Math.round(ms) || 0;
        p.billing = billing; p.step = step;
        await b.put('providers', p);
      }
    },
    async spentToday() { const d = await b.get('ledger', today()); return d ? Number(d.usd) || 0 : 0; },
    async listLookups({ limit = 50, offset = 0, q = '', status = '' } = {}) {
      const needle = String(q || '').trim().toLowerCase();
      let rows = (await b.getAll('lookups')).map(norm);
      if (status) rows = rows.filter(r => r.status === status);
      if (needle) rows = rows.filter(r => (r.email + ' ' + (r.nameGiven || '') + ' ' + JSON.stringify(r.profile || '')).toLowerCase().includes(needle));
      rows.sort((x, y) => (x.lookedUpAt < y.lookedUpAt ? 1 : x.lookedUpAt > y.lookedUpAt ? -1 : 0));
      const lim = Math.min(Math.max(1, Number(limit) || 50), 500), off = Math.max(0, Number(offset) || 0);
      return { total: rows.length, items: rows.slice(off, off + lim) };
    },
    async stats() {
      const d = now();
      const todayDay = today(), monthStart = todayDay.slice(0, 8) + '01';
      const rows = (await b.getAll('lookups')).map(norm);
      const dayKey = r => dayOf(new Date(r.lookedUpAt), timeZone);
      const agg = list => ({ lookups: list.length, found: list.filter(r => r.status === 'found').length, usd: round(list.reduce((a, r) => a + (r.cost.usd || 0), 0)) });
      const byDay = new Map();
      for (const r of rows) { const k = dayKey(r); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(r); }
      const ledger = new Map((await b.getAll('ledger')).map(x => [x.day, x]));
      const daily = [];
      for (let i = 29; i >= 0; i--) {
        const day = dayOf(new Date(d.getTime() - i * 86400000), timeZone);
        const l = byDay.get(day) || [], g = ledger.get(day);
        daily.push({ day, lookups: l.length, found: l.filter(r => r.status === 'found').length, usd: g ? round(g.usd) : 0, calls: g ? g.calls : 0 });
      }
      const providers = (await b.getAll('providers')).sort((x, y) => y.usd - x.usd || y.calls - x.calls);
      return {
        today: agg(byDay.get(todayDay) || []),
        month: agg(rows.filter(r => dayKey(r) >= monthStart)),
        allTime: agg(rows),
        providers,
        daily,
        cacheEntries: rows.length,
      };
    },
    prune,
    async exportAll() {
      return { format: 'senderfinder/1', exportedAt: now().toISOString(), lookups: (await b.getAll('lookups')).map(norm), ledger: await b.getAll('ledger'), providers: await b.getAll('providers') };
    },
    async importAll(data, { replace = false } = {}) {
      if (!data || !['senderfinder/1', 'email-linkedin/1'].includes(data.format)) throw Object.assign(new Error('BAD_FORMAT'), { code: 'BAD_FORMAT' });
      if (replace) for (const s of STORES) await b.clear(s);
      let n = 0;
      for (const r of data.lookups || []) {
        if (!r || typeof r.email !== 'string' || !r.lookedUpAt) continue;
        const existing = await b.get('lookups', r.email);
        if (existing && existing.lookedUpAt >= r.lookedUpAt) continue;
        await b.put('lookups', { ...norm(r), createdAt: r.createdAt || r.lookedUpAt }); n++;
      }
      for (const l of data.ledger || []) {
        if (!l || typeof l.day !== 'string') continue;
        const cur = await b.get('ledger', l.day);
        if (cur && !replace) await b.put('ledger', { day: l.day, usd: round(cur.usd + (l.usd || 0)), calls: cur.calls + (l.calls || 0), hits: cur.hits + (l.hits || 0) });
        else await b.put('ledger', { day: l.day, usd: round(l.usd), calls: Number(l.calls) || 0, hits: Number(l.hits) || 0 });
      }
      for (const p of data.providers || []) {
        if (!p || typeof p.provider !== 'string') continue;
        const cur = await b.get('providers', p.provider);
        if (cur && !replace) await b.put('providers', { ...cur, calls: cur.calls + (p.calls || 0), hits: cur.hits + (p.hits || 0), errors: (cur.errors || 0) + (p.errors || 0), usd: round(cur.usd + (p.usd || 0)), ms: (cur.ms || 0) + (p.ms || 0) });
        else await b.put('providers', { provider: p.provider, calls: Number(p.calls) || 0, hits: Number(p.hits) || 0, errors: Number(p.errors) || 0, usd: round(p.usd), ms: Number(p.ms) || 0 });
      }
      return { imported: n };
    },
    async clearAll() { for (const s of STORES) await b.clear(s); },
    close: () => b.close(),
  };
}
