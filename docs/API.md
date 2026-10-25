# Email-Linkedin server API

Base URL: `http://127.0.0.1:3390` by default (`PORT` in `.env`).
Every `/api/*` request needs `Authorization: Bearer <APP_TOKEN>` (the token in `.env`).
The web app is served from `/` by the same server, so it uses the same origin.
Chrome-extension origins are allowed by CORS (`chrome-extension://*`), nothing else.

All responses are JSON. Errors look like `{ "ok": false, "error": "<CODE>", "message": "<human text>" }`
with HTTP 400 (bad input), 401 (bad/missing token), 402 (daily budget exhausted), 429 (rate limited), 500.

## POST /api/lookup
Find the LinkedIn profile behind one email address.

Request body:
```json
{
  "email": "jane@acme.com",          // required
  "name": "Jane Doe",                // optional, the display name from the mail header
  "domain": "acme.com",              // optional, defaults to the email domain
  "signature": "…text of the mail signature / body…", // optional, scanned for linkedin.com/in links (free)
  "source": "gmail" | "outlook" | "web" | "api",      // optional, for the history
  "force": false,                    // optional, true = ignore the cache and look up again (may cost money)
  "maxUsd": 0.05                     // optional, per-lookup cap, cannot exceed LOOKUP_MAX_USD
}
```

Response (200):
```json
{
  "ok": true,
  "email": "jane@acme.com",
  "status": "found" | "not_found" | "uncertain" | "skipped",
  "cached": false,
  "lookedUpAt": "2026-10-25T08:00:00.000Z",
  "profile": {                       // null when not found
    "linkedinUrl": "https://www.linkedin.com/in/janedoe",
    "fullName": "Jane Doe",
    "headline": "Head of Partnerships at Acme",
    "title": "Head of Partnerships",
    "company": "Acme",
    "companyDomain": "acme.com",
    "location": "Berlin, Germany",
    "positions": [{ "title": "…", "company": "…", "current": true }]
  },
  "match": {
    "provider": "treg:blitzapi.people.email.reverse", // which step produced the answer
    "nameGiven": "Jane Doe",
    "nameMatched": true | false | null,                // null = no name was given to compare with
    "confidence": "exact" | "name" | "weak"
  },
  "cost": { "usd": 0.000495, "calls": [
    { "step": "signature", "provider": "local", "status": "miss", "usd": 0, "ms": 1 },
    { "step": "blitzapi", "provider": "treg:blitzapi.people.email.reverse", "status": "hit", "usd": 0.000495, "ms": 812 }
  ]},
  "skippedReason": null              // e.g. "free_mail_provider", "daily_budget", "invalid_email"
}
```
`status: "skipped"` is returned without any paid call for free-mail domains (gmail.com, qq.com, …) unless `force` is true.
`status: "uncertain"` means a provider returned a profile but the name does not match the header name.

## GET /api/lookups?limit=50&offset=0&q=acme&status=found
History of lookups (newest first). Returns `{ ok, total, items: [ <same shape as a lookup response, plus "source"> ] }`.

## DELETE /api/lookups/:email
Removes the cached result so the next lookup runs again. Returns `{ ok: true, removed: 1 }`.

## GET /api/stats
```json
{ "ok": true,
  "today":  { "lookups": 12, "found": 8, "usd": 0.031 },
  "month":  { "lookups": 240, "found": 150, "usd": 0.61 },
  "allTime":{ "lookups": 900, "found": 600, "usd": 2.4 },
  "budget": { "dailyCapUsd": 2, "spentTodayUsd": 0.031, "lookupMaxUsd": 0.05 },
  "providers": [ { "provider": "treg:blitzapi.people.email.reverse", "calls": 100, "hits": 40, "usd": 0.02 } ],
  "daily": [ { "day": "2026-10-20", "lookups": 10, "found": 6, "usd": 0.02 } ]  // last 30 days
}
```

## GET /api/health
No auth needed. `{ ok: true, version, providers: { monid: true, treg: true, firecrawl: false }, steps: ["signature","blitzapi",…] }`.

## GET /api/steps
The configured waterfall: `{ ok, steps: [ { id, provider, label, maxUsd, needs: ["email"] | ["email","name"], enabled } ] }`.

## POST /api/lookup/batch
`{ "items": [ { "email", "name" }, … ] }` up to 50. Runs lookups sequentially, returns `{ ok, results: [ <lookup response> ] }`.
