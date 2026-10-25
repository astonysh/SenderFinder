# Telemetry receiver

The server side of the extension's **on-by-default, one-switch-to-turn-off** anonymous usage statistics.
One Cloudflare Worker, one D1 table, about 60 lines. What the extension sends is documented in
`extension/core/telemetry.js` and on the privacy page; this Worker validates it and upserts one row
per (install, day). It does not log IPs or user agents, sets no cookies, and has request logging disabled.

## Deploy (once)

```bash
cd telemetry
npx wrangler login
npx wrangler d1 create senderfinder-telemetry          # copy the database_id into wrangler.toml
npx wrangler d1 execute senderfinder-telemetry --remote --file schema.sql
npx wrangler deploy                                      # prints the workers.dev URL
```

Then either enable the `[[routes]]` block in `wrangler.toml` for a custom domain, or put the workers.dev
URL into `TELEMETRY_ENDPOINT` in `extension/core/telemetry.js`. The two must match.

Smoke test:

```bash
curl -s https://<your-worker-host>/health
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<your-worker-host>/v1/daily \
  -H 'content-type: application/json' \
  -d '{"v":1,"install":"00000000-0000-4000-8000-000000000000","day":"'$(date +%F)'","version":"0.2.0","lang":"en","lookups":3,"found":2,"uncertain":0,"not_found":1,"skipped":0,"cached":0,"usd":0.011,"steps":{"blitzapi":{"calls":3,"hits":2,"errors":0}},"sources":{"gmail":3}}'
# expect 204
```

## Reading the numbers

`node scripts/metrics-report.js` (repository root) queries this table through the D1 HTTP API together with
the other public metrics. Direct queries:

```bash
npx wrangler d1 execute senderfinder-telemetry --remote --command \
  "SELECT substr(day,1,7) AS month, COUNT(DISTINCT install) AS installs, SUM(lookups) AS lookups, SUM(found) AS found, ROUND(SUM(usd),2) AS usd FROM daily GROUP BY 1 ORDER BY 1 DESC"
```
