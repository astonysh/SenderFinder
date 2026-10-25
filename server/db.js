'use strict';
// SQLite storage (node:sqlite, no native build). One row per email in `lookups`,
// one row per provider call in `calls` (the spend ledger).
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS lookups (
      email TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      name_given TEXT,
      source TEXT,
      profile_json TEXT,
      match_json TEXT,
      calls_json TEXT,
      cost_usd REAL NOT NULL DEFAULT 0,
      skipped_reason TEXT,
      looked_up_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      step TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      usd REAL NOT NULL DEFAULT 0,
      billing TEXT NOT NULL DEFAULT 'reported',
      ms INTEGER NOT NULL DEFAULT 0,
      day TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS calls_day ON calls(day);
    CREATE INDEX IF NOT EXISTS lookups_at ON lookups(looked_up_at);
  `);
  return db;
}

function dayOf(date, timeZone) {
  // YYYY-MM-DD in the budget time zone.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function createStore({ file, timeZone = 'Europe/Berlin', now = () => new Date() }) {
  const db = openDb(file);
  const q = {
    get: db.prepare('SELECT * FROM lookups WHERE email = ?'),
    put: db.prepare(`INSERT INTO lookups (email, status, name_given, source, profile_json, match_json, calls_json, cost_usd, skipped_reason, looked_up_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET status=excluded.status, name_given=excluded.name_given, source=excluded.source, profile_json=excluded.profile_json,
      match_json=excluded.match_json, calls_json=excluded.calls_json, cost_usd=excluded.cost_usd, skipped_reason=excluded.skipped_reason, looked_up_at=excluded.looked_up_at`),
    del: db.prepare('DELETE FROM lookups WHERE email = ?'),
    call: db.prepare('INSERT INTO calls (email, step, provider, status, usd, billing, ms, day, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    spentDay: db.prepare('SELECT COALESCE(SUM(usd), 0) AS usd FROM calls WHERE day = ?'),
    statsRange: db.prepare(`SELECT COUNT(*) AS lookups, SUM(CASE WHEN status = 'found' THEN 1 ELSE 0 END) AS found, COALESCE(SUM(cost_usd), 0) AS usd
      FROM lookups WHERE looked_up_at >= ?`),
    statsAll: db.prepare(`SELECT COUNT(*) AS lookups, SUM(CASE WHEN status = 'found' THEN 1 ELSE 0 END) AS found, COALESCE(SUM(cost_usd), 0) AS usd FROM lookups`),
    providers: db.prepare(`SELECT provider, COUNT(*) AS calls, SUM(CASE WHEN status = 'hit' THEN 1 ELSE 0 END) AS hits, COALESCE(SUM(usd), 0) AS usd
      FROM calls WHERE provider <> 'local' GROUP BY provider ORDER BY usd DESC, calls DESC`),
    daily: db.prepare(`SELECT day, COALESCE(SUM(usd), 0) AS usd, COUNT(DISTINCT email) AS lookups FROM calls WHERE day >= ? GROUP BY day ORDER BY day`),
    dailyFound: db.prepare(`SELECT substr(looked_up_at, 1, 10) AS day, COUNT(*) AS lookups, SUM(CASE WHEN status = 'found' THEN 1 ELSE 0 END) AS found, COALESCE(SUM(cost_usd), 0) AS usd
      FROM lookups WHERE looked_up_at >= ? GROUP BY day ORDER BY day`),
  };
  const rowToRecord = r => r && ({
    email: r.email, status: r.status, nameGiven: r.name_given || null, source: r.source || null,
    profile: r.profile_json ? JSON.parse(r.profile_json) : null,
    match: r.match_json ? JSON.parse(r.match_json) : null,
    cost: { usd: r.cost_usd, calls: r.calls_json ? JSON.parse(r.calls_json) : [] },
    skippedReason: r.skipped_reason || null, lookedUpAt: r.looked_up_at, createdAt: r.created_at,
  });
  return {
    db,
    getLookup: email => rowToRecord(q.get.get(email)),
    saveLookup(rec) {
      const at = rec.lookedUpAt || now().toISOString();
      const existing = q.get.get(rec.email);
      q.put.run(rec.email, rec.status, rec.nameGiven || null, rec.source || null, rec.profile ? JSON.stringify(rec.profile) : null,
        rec.match ? JSON.stringify(rec.match) : null, JSON.stringify(rec.cost?.calls || []), Number(rec.cost?.usd || 0), rec.skippedReason || null,
        at, existing ? existing.created_at : at);
      return rowToRecord(q.get.get(rec.email));
    },
    deleteLookup: email => q.del.run(email).changes,
    recordCall({ email, step, provider, status, usd = 0, billing = 'reported', ms = 0 }) {
      const d = now();
      q.call.run(email, step, provider, status, Number(usd) || 0, billing, Math.round(ms) || 0, dayOf(d, timeZone), d.toISOString());
    },
    spentToday: () => Number(q.spentDay.get(dayOf(now(), timeZone)).usd) || 0,
    listLookups({ limit = 50, offset = 0, q: text = '', status = '' } = {}) {
      const where = [], args = [];
      if (text) { where.push('(email LIKE ? OR name_given LIKE ? OR profile_json LIKE ?)'); const like = `%${text}%`; args.push(like, like, like); }
      if (status) { where.push('status = ?'); args.push(status); }
      const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const total = db.prepare(`SELECT COUNT(*) AS n FROM lookups ${w}`).get(...args).n;
      const rows = db.prepare(`SELECT * FROM lookups ${w} ORDER BY looked_up_at DESC LIMIT ? OFFSET ?`).all(...args, Math.min(Math.max(1, limit), 200), Math.max(0, offset));
      return { total, items: rows.map(rowToRecord) };
    },
    stats() {
      const d = now();
      const today = dayOf(d, timeZone);
      const monthStart = today.slice(0, 8) + '01';
      const since30 = dayOf(new Date(d.getTime() - 29 * 86400000), timeZone);
      const norm = r => ({ lookups: Number(r.lookups) || 0, found: Number(r.found) || 0, usd: Number(r.usd) || 0 });
      const spend = Object.fromEntries(q.daily.all(since30).map(r => [r.day, Number(r.usd) || 0]));
      const found = Object.fromEntries(q.dailyFound.all(since30).map(r => [r.day, r]));
      const daily = [];
      for (let i = 29; i >= 0; i--) {
        const day = dayOf(new Date(d.getTime() - i * 86400000), timeZone);
        const f = found[day] || {};
        daily.push({ day, lookups: Number(f.lookups) || 0, found: Number(f.found) || 0, usd: spend[day] || 0 });
      }
      return {
        today: norm(q.statsRange.get(today)), month: norm(q.statsRange.get(monthStart)), allTime: norm(q.statsAll.get()),
        providers: q.providers.all().map(r => ({ provider: r.provider, calls: Number(r.calls), hits: Number(r.hits) || 0, usd: Number(r.usd) || 0 })),
        daily,
      };
    },
    close: () => db.close(),
  };
}

module.exports = { createStore, dayOf };
