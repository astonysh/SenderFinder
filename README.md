# SenderFinder

[中文](README.zh-CN.md) · [Sponsor SenderFinder](https://senderfinder.com/sponsors)

An open-source browser extension in the spirit of Rapportive and Clearbit Connect, available for Chrome and desktop Microsoft Edge: open an email in Gmail (Outlook on the web is best-effort) and the browser's side panel shows the sender's LinkedIn profile: photo, name, title, company, location, their local time, the profile link and, when known, an X / Twitter link. Other people in the thread (other senders, To, Cc) are listed below and looked up only when you click them. The mail page itself only gets a tiny magnifier mark next to the sender's name, so Gmail's layout is untouched; clicking the mark switches the panel to that person.

## Install

<a href="https://microsoftedge.microsoft.com/addons/detail/senderfinder/pfgdkmjokjkalbpeapkdfopomdapnmki"><img src="site-src/assets/edge.svg" width="24" height="24" alt="Microsoft Edge"></a> **[Install from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/senderfinder/pfgdkmjokjkalbpeapkdfopomdapnmki)**

The Edge version is live and can be installed directly from the store. The Chrome listing is not live yet; use the source installation steps below.

Open the panel once by clicking the extension's toolbar icon (or the magnifier mark in an email); it then stays open in that tab and follows the email you are reading.

The panel's **Connect** button opens the person's LinkedIn profile in a new tab. You click Connect; in the invitation dialog the extension clicks “Add a note” once and fills in your editable note template. **The extension never clicks Connect or Send**. LinkedIn access is optional and can be revoked in settings. The relationship/photo feature also uses your own LinkedIn session to read associated company links after you grant access.

Photos can come from a data provider; if you enable the LinkedIn feature, the extension also uses your own LinkedIn session to read connection degree and photo. X links come from the same provider lookup. Photo URLs can expire, in which case the panel shows initials. Local time uses the provider's time zone when given (Hunter), otherwise a best-effort guess from the profile location (`extension/core/geo.js`).

You paste your own provider keys into the extension's settings. Lookups go straight from your browser to the configured providers, and results are cached in your browser's IndexedDB. Lookup addresses and provider results are not sent to SenderFinder. The only thing sent to the project is an anonymous daily usage count (on by default, one switch to turn off, see below).

## How a lookup works

Cheapest step first. Each provider's current catalog price is read before the call and the call is skipped if it exceeds your per-lookup cap; there is also a daily cap. A hit stops the chain and is cached, so an address never costs money twice.

| # | Step | Via | Input | Price on hit | Miss | Observed hit rate |
|---|---|---|---|---:|---|---:|
| 1 | `signature` | local regex over the mail body for linkedin.com/in links | body | $0 | — | — |
| 2 | `blitzapi` | treg `blitzapi.people.email.reverse` | email | $0.0005 | free | 50 % |
| 3 | `hunter` | Monid `hunterio /people/find` | email | $0.0049 | free (404) | 17.9 % |
| 4 | `quickenrich` | treg `quickenrich.people.enrich` | email | $0.0048 | free | 17.4 % |
| 5 | `apollo` | Monid `apollo /people/match` | email + name + domain | $0.026 | free; an empty stub attached to a known company is billed | 100 % (19/19) |
| 6 | `datalegion` | Firecrawl Alexandria `datalegion people/enrich-base-no-contact` | email | 10 credits (≈ $0.008–0.032) | free | — |

Observed hit rate is answered ÷ reached — the conditional chance that a step answers once the chain reaches it, measured on the 50-address run of 2026-10-25. Full table and caveats: https://senderfinder.com/email-enrichment-api-benchmark.

Optional steps (tick them in settings): `village` (treg, $0.02), `contactout` (Monid, $0.02). Prices are the catalog prices on 2026-10-25; the extension re-reads them before every call.

## One provider is enough

The extension knows three keys; each is an aggregator with several data sources behind it. The waterfall skips every step whose key is missing (logged as `not_configured`, no error), so **any single key runs the whole flow**. The settings page groups the keys by provider and lists what each key unlocks.

| Only this key | Steps that run | Typical price | Coverage | Good for |
|---|---|---:|---|---|
| **treg** | `blitzapi` → `quickenrich` (optionally `village`) | $0.0005–0.005 | email only; roughly half to 60 % of the benchmark sample | tight budgets, high volume |
| **Monid** | `hunter` → `apollo` (optionally `contactout`) | $0.005–0.026 | Apollo matches on name + company domain; 19/19 in the benchmark | hit rate |
| **Firecrawl** | `datalegion` only | 10 credits | no hit-rate data | not recommended alone; fallback only |

Both treg and Monid together is the default waterfall: treg's cheap steps first, Monid's Apollo as the backstop. Apollo, Hunter and ContactOut are called through Monid, BlitzAPI, QuickEnrich and Village through treg; the extension never calls a data source directly, so an Apollo API key of your own does nothing here.

No key needed for: the signature scan (local), the cache, and LinkedIn relationship / photo / Connect (your own LinkedIn session, optional permission).

If the provider's name contradicts the display name in the mail header, the answer is kept only as a fallback, the next steps still run and a name-matching answer wins; if nothing matches, the result is marked "uncertain" and both names are shown. Personal-mailbox domains (gmail.com, qq.com …) and role addresses (info@, support@ …) are skipped unless you click "look up anyway".

On a 50-address benchmark of verified work emails (2026-10-25): 48 found (47 with a matching name, 1 found without a returned profile name), 2 uncertain, $0.0111 per address on average; full table at https://senderfinder.com/email-enrichment-api-benchmark.

<a name="install-from-source"></a>
## Install from source

Until the Chrome Web Store listing is live:

1. Download or clone this repository.
2. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick the `extension/` folder.
3. The settings page opens on first install. Get a key; one is enough to start:
   - **Monid**: https://monid.ai?fpr=sf → API keys. One key covers Hunter, Apollo and ContactOut. Affiliate link: qualifying paid signups may earn the maintainer a commission.
   - **treg**: https://treg.to → account → token. One token covers BlitzAPI, QuickEnrich and Village.
   - Firecrawl (optional fallback): https://firecrawl.link/sf → API keys.
4. Click "test keys (free)", then open any email in Gmail.

Defaults: only the sender of the opened message is looked up automatically; everyone else in the thread waits for a click. Automatic lookups are capped per day (30), then everything is manual. Per-lookup cap $0.05, daily cap $2. All adjustable.

### Microsoft Edge desktop

Install from [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/senderfinder/pfgdkmjokjkalbpeapkdfopomdapnmki). Edge uses the same Chromium MV3 extension as Chrome. For local installation, open `edge://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select `extension/`. To submit to Microsoft Edge Add-ons, run `npm run zip:edge` and upload `output/senderfinder-edge-<version>.zip`. Settings, provider keys and cache are stored separately in Edge; the Data page can export JSON for moving non-key data.

## UI language

The UI follows the browser language; English is the default. Ten languages are bundled in `extension/_locales/`: English (`en`), Simplified Chinese (`zh_CN`), Traditional Chinese (`zh_TW`), Japanese (`ja`), Korean (`ko`), German (`de`), French (`fr`), Spanish (`es`), Brazilian Portuguese (`pt_BR`) and Italian (`it`). Any other browser language gets English.

Every `messages.json` must be updated when a string is added or changed; `scripts/locales.test.js` (part of `npm test`) checks that all locales have the same keys, the same placeholders (`$1`, `$$`) and a store description within Chrome's 132 characters. `npm run e2e` runs in English; `npm run e2e:locales` screenshots the side panel and the settings page in every language into `output/playwright/locales/` to eyeball wrapping. Right-to-left languages (Arabic, Hebrew) need an RTL layout pass first and are not bundled yet.

## Stable extension id (settings survive updates)

Keys, cache and history live in the storage Chrome assigns to this extension id. For an unpacked extension the id is derived from the folder path: load it from another folder, or remove and re-add it, and you get a different id with empty settings. `manifest.json` therefore carries a fixed `key` (public key), so the id is the same wherever you load it from; to update, click "Reload" in `chrome://extensions` or overwrite the files in place.

The matching private key `extension-key.pem` is not committed; keep your own backup and never put it in an upload or release archive. For the first upload run `npm run zip -- --store`. After the store creates the item ID, copy the public key from the developer dashboard into `manifest.json` if you want local builds to use that ID.

## Settings page

Click the toolbar icon → "open settings": keys, step order and toggles, caps; history with search, re-lookup, delete and CSV export; statistics (today / month / all time, 30-day chart, per-provider hit rates and spend); data export / import (JSON) and cache cleanup. The cache keeps 90 days / 5000 entries by default. Exports never contain keys.

## Privacy

- Lookup fields (email address, display name and company domain) go directly to the provider you configured; some providers may forward them to disclosed downstream services. Provider price catalogs are also read directly from the provider.
- The mail body is scanned locally for `linkedin.com/in` links and is not stored or transmitted.
- If you enable LinkedIn features and grant access, the extension uses your own session to read connection degree and photo. In the invitation dialog it clicks “Add a note” once to fill your note; it never clicks Connect or Send.
- Anonymous usage statistics are on by default and can be switched off in settings. While on, the project's statistics service receives one daily summary: aggregate counts, provider-step and mail-client totals, rounded spend, version, language and a random installation ID. It receives no lookup address, name, domain, profile, key or message text.
- Of what providers return, only professional fields are kept (name, title, company, location, positions, LinkedIn URL); phone numbers and personal emails are dropped in the adapter.
- Calls are never retried: an answer lost after sending is reported as "uncertain" rather than paid twice.

## Compliance (GDPR, UK GDPR, Chrome Web Store)

The full text is at https://senderfinder.com/privacy; in short:

- **You are the controller of the lookups you run.** You decide whom to look up, through which provider and for how long to keep the result; lookup addresses and provider results are not sent to SenderFinder. The anonymous usage counts (on by default, one switch to turn off) contain no personal data. For one-off lookups of people writing from a work address, the usual lawful basis in the EU/UK is legitimate interest (Art. 6(1)(f) GDPR); mention contact-enrichment in your organisation's privacy notice to cover the Art. 14 transparency duty.
- **Minimisation and retention.** Only the email address, display name and company domain are sent; only professional fields are kept, phone numbers and personal emails are discarded in the adapter; results are cached for 90 days by default (max 5,000 entries), can be wiped in one click on the Data tab and deleted one by one on the History tab to answer a data-subject request.
- **Transfers.** Lookups go straight from your browser to the provider, which may be outside the EEA/UK. The transfer safeguards (SCCs, DPF …) are part of your agreement with each provider; read their terms and DPA before adding a key.
- **Personal mailboxes are skipped by default.** Do not look up private individuals; gmail.com, outlook.com and similar domains are never sent unless you ask.
- **Controller for the anonymous usage counts** is Tony Li (tony@senderfinder.com). They are on by default, contain only counts and a random installation ID, and can be previewed and switched off in one click; switching off deletes the local ID and unsent summaries.
- **Chrome Web Store User Data Policy.** The extension scans the message body locally and does not use it for advertising. Lookup fields go to the provider you selected (and any downstream services it discloses); anonymous usage counts go to the project service and can be switched off at any time (Limited Use).

## Development

The Chrome Web Store kit (screenshots, promo tiles, listing texts, field-by-field submission guide) lives in `store/`; `npm run store:assets` regenerates the images and `npm run zip -- --store` builds the upload zip. For Edge Add-ons, `npm run zip:edge` creates a separately named upload archive.

```bash
npm test                    # 18 unit tests (waterfall, store, matching), synthetic data, Node 22.13+
npm run e2e                 # headless Chromium loads the extension on a fake Gmail page with no keys; provider hosts are blocked
npm run probe               # free: check the keys in .env, read catalog prices
npm run lookup -- a@b.com   # one lookup from the CLI (costs money; cache in data/cli-cache.json)
npm run bench -- file.csv   # benchmark a CSV (costs money)
npm run migrate:sqlite      # convert the v0.1 server's SQLite into the extension's import JSON
npm run zip                 # output/senderfinder-<version>.zip
npm run zip:edge            # output/senderfinder-edge-<version>.zip
```

`npm run e2e` needs a Playwright install: `PLAYWRIGHT_MODULE=/path/to/node_modules/playwright npm run e2e`.

```
extension/
  core/            platform-neutral logic: waterfall.js, store.js (IndexedDB / memory), identity.js, signature.js, providers/
  lib/settings.js  settings and the lookup service built from them
  background.js    service worker: the only place that holds keys and runs the waterfall
  content/         Gmail / Outlook content scripts and the magnifier mark next to the sender (chip.js)
  sidepanel.*      side panel: the current person, others in the thread, today's usage and the toggles
  _locales/        UI strings: en (default), zh_CN
  lib/i18n.js      chrome.i18n wrapper and data-i18n page localisation
  options.*        settings / history / stats / data
site/              website (static, Cloudflare Pages; see site/README.md)
scripts/           tests, e2e, probe, CLI, benchmark, migration, packaging
```

The v0.1 server + web app lives on the git tag `v0.1-server`.

## Anonymous usage statistics (on by default, one switch to turn off)

The settings page has a switch called "Send anonymous usage statistics". It is on after installation; turn it off if you prefer. While on, once a day the extension posts one summary of the previous day (lookup counts and outcomes, per-step calls and hits, mail client, rounded total spend, extension version, UI language, a random installation id) and never any email address, name, domain, LinkedIn URL, profile field, key or message content. The "Preview what would be sent" button shows the exact document; switching off deletes the installation id and anything unsent. The receiving side is a Cloudflare Worker + D1 table in `telemetry/`; it does not log IP addresses.

## Sponsor SenderFinder

I built SenderFinder because I needed it myself, and I hope it is useful to you too. There is also a personal goal behind the project: **I want to buy a Tesla Model Y.** The offer I had been looking at ended, so I set myself a challenge: build something useful and let sponsorship help pay for the car.

My target is **about $500 a month in sponsorship income**. Sponsorship supports me as the maintainer, including my Model Y savings goal and the ongoing work on the project.

Read the [sponsorship details and where the money goes](https://senderfinder.com/sponsors#use-of-funds). To discuss sponsorship, email [tony@senderfinder.com](mailto:tony@senderfinder.com).

## License

GNU AGPL-3.0 (see `LICENSE`). Contributions require agreeing to the CLA in `CONTRIBUTING.md`.
