# SenderFinder website

Design adapted from [ixartz/SaaS-Boilerplate](https://github.com/ixartz/SaaS-Boilerplate) (MIT, © 2026 Remi W.):
the spacing scale, typography, gradient accents, card/button shapes and section headers. Only the design —
no code or dependency from that project is used. Every page in every language uses that one design system
(`site-src/assets/app.css`), hand-written CSS: no Tailwind build, no runtime. See `site-src/THIRD_PARTY_NOTICES.md`.

The site is **generated**. `site-src/` holds the templates, the ten language files and the assets;
`site/` is the built output and is committed as well, because the deployment runs no build step — it
just serves the folder (Cloudflare **Workers Static Assets**, configured in `wrangler.toml`).
Nothing external is loaded: no fonts, no CDNs, no analytics, and the CSP in `site/_headers` enforces that.

```bash
npm run site     # rebuild site/ from site-src/
npm test         # includes scripts/site.test.js: locale keys, build freshness, links, hreflang
```

Node 22+, no dependencies. `npm run site` deletes `site/` first, so it is never half old and half new.

## Files

| Path | What it is |
|---|---|
| `site-src/pages/*.html` | One template per page. `{{key}}`, `{{#each list}}…{{/each}}`, `{{#if value}}…{{/if}}` |
| `site-src/locales/<locale>.json` | Every string of every page, one file per language |
| `site-src/site.config.json` | Build switches (currently `consentMode`) |
| `site-src/partials/icons.svg` | The icon sprite, inlined into every page |
| `site-src/assets/app.css` | The only stylesheet, for every page: tokens (light/dark/system), shared chrome, the marketing layout, prose pages, install steps, calculator |
| `site-src/assets/theme-boot.js` | Blocking head script: applies the saved theme and consent state before first paint |
| `site-src/assets/theme.js` | The header's theme switch and the notice at the bottom of every page |
| `site-src/assets/calc.js` | Cost model + calculator wiring; the build imports the same file for the no-JS table |
| `site-src/assets/avatars/` | Illustrated avatars used in the product screenshots |
| `site-src/assets/screenshots/` | Product screenshots, written by `npm run store:assets` |
| `site-src/_headers`, `site-src/robots.txt`, `site-src/.assetsignore` | Copied to `site/` verbatim |
| `scripts/build-site.js` | The generator: shell, hreflang, sitemap, assets, icon and provider logo copies |

Everything in `site/` is generated, including this README, `sitemap.xml` and the asset copies.

## Pages and URL structure

English is the default and lives at the root; the other nine languages sit under a lowercase prefix.
Canonical URLs are extensionless (`wrangler.toml` uses `html_handling = "auto-trailing-slash"`, so
`/privacy` serves `privacy.html` and `/privacy.html` redirects to `/privacy`). Internal links keep
`.html` so the site also works when opened straight from disk.

| Page | English | Example, other languages |
|---|---|---|
| Landing page | `/` | `/ja/` |
| Install guide | `/install` | `/pt-br/install` |
| Privacy statement | `/privacy` | `/de/privacy` |
| Clearbit Connect alternative | `/clearbit-connect-alternative` | `/zh-tw/clearbit-connect-alternative` |
| Rapportive alternative | `/rapportive-alternative` | `/fr/rapportive-alternative` |
| 404 | `/404.html` (English only, `not_found_handling = "404-page"`) | — |

| Language | Prefix | `<html lang>` | `extension/_locales/` |
|---|---|---|---|
| English | *(root)* | `en` | `en` |
| 简体中文 | `/zh-cn/` | `zh-CN` | `zh_CN` |
| 繁體中文 | `/zh-tw/` | `zh-TW` | `zh_TW` |
| 日本語 | `/ja/` | `ja` | `ja` |
| 한국어 | `/ko/` | `ko` | `ko` |
| Deutsch | `/de/` | `de` | `de` |
| Français | `/fr/` | `fr` | `fr` |
| Español | `/es/` | `es` | `es` |
| Italiano | `/it/` | `it` | `it` |
| Português (Brasil) | `/pt-br/` | `pt-BR` | `pt_BR` |

Every page carries `<link rel="alternate" hreflang>` for all ten languages plus `x-default` (English),
and `sitemap.xml` lists every page in every language with the same alternates. The language switcher in
the header is a plain `<details>` element: each language name is written in its own language, and there
is no automatic redirect by `Accept-Language` — a URL always shows the language it names.

The hero headline and its sub-line are **not** in the locale files: they are `panel_slogan` and
`tagline` read from `extension/_locales/<locale>/messages.json` at build time, so the site and the
extension cannot drift apart. The home page `<title>` is `SenderFinder — <panel_slogan>`.

## Adding or changing a language

1. Copy `site-src/locales/en.json` to `site-src/locales/<locale>.json` and translate the values.
   Keys, nesting and list lengths must stay identical — `npm test` compares every key and also checks
   that HTML tags and `{{placeholders}}` survive.
2. Add the language to `LANGUAGES` in `scripts/build-site.js` (locale id, `hreflang`, URL prefix, the
   language's own name for the switcher). English must stay first.
3. Run `npm run site` and `npm test`, then look at one page at 320 px, 768 px and 1280 px: long words
   wrap, CJK line height comes from the `:lang()` rules in `app.css`.

Strings may contain inline HTML (`<a>`, `<code>`, `<strong>`) and placeholders such as `{{url.install}}`
(a relative link to a page of the same language). Product names — SenderFinder, Monid, treg, Firecrawl,
Apollo, Hunter, ContactOut, BlitzAPI, QuickEnrich, Village, Data Legion, LinkedIn, Gmail, Outlook —
stay untranslated. Use the same wording as that language's `extension/_locales/<locale>/messages.json`
where a term overlaps (`side panel`, `settings`, `look up`, `key`). Non-English privacy pages start with
one sentence saying the English version prevails.

## Theme, icons and the notice

- **Theme.** `assets/theme-boot.js` (a blocking classic script in `<head>`) reads `localStorage['el-theme']`
  and sets `<html data-theme="light|dark">` before first paint, exactly like the extension. Without a
  saved choice the site follows `prefers-color-scheme`. The header control writes the same key and also
  sets `data-theme-choice` so the summary can show a sun, a moon or a monitor. Without JavaScript the
  control stays hidden and the site follows the system.
- **Icons.** One sprite (`site-src/partials/icons.svg`) with a single stroke style, inlined into every
  page and coloured with `currentColor`, so it follows the theme. Icons are picked by position in
  `scripts/build-site.js` (`HOW_ICONS`, `FACT_ICONS`, …) — never stored in the locale files.
- **Provider logos** are copied from `extension/icons/vendors/` at build time; the header avatar and the
  PNG favicon are `extension/icons/icon128.png`, also copied, so they stay in sync with the extension.
- **The notice** at the bottom of every page starts `hidden` in the markup: with JavaScript off nothing
  appears and nothing is stored. It is driven by `site.config.json`:
  - `consentMode: false` (today) — informational, one **OK**, stored as `localStorage['sf-notice']`.
  - `consentMode: true` — **Accept** / **Reject**, stored as `localStorage['sf-consent']`, and exposed
    as `<html data-consent="granted|denied|pending">` plus a `window` event `sf:consent`, so an
    analytics loader can wait for it. Nothing else changes; no analytics is bundled here.

## Adding website analytics later

The site currently loads no analytics. If one is added:

1. Add its origin to the CSP in `site-src/_headers` (`script-src`, and `connect-src` if it sends beacons).
2. Fill in the paragraph marked `<!-- ANALYTICS-PLACEHOLDER -->` in the `cookies` section of every
   `site-src/locales/*.json`, and add the tool name there.
3. Set `consentMode: true` in `site-src/site.config.json` and update the notice wording in every locale
   (`ui.notice.*`), so the bar asks before anything loads.
4. Keep the extension's own promises separate from the website's: the extension has no SenderFinder
   server and its usage counts are opt-in, whatever the website does.

## The cost calculator

`site-src/assets/calc.js` holds the model and is the only source of truth for it:

- **prices**: provider catalog prices from `README.md`, dated 2026-10-25 (`PRICES`);
- **rates**: per-step hit rates from the 50-address benchmark of the same date (`CHAINS`), where `p` is
  the chance a step answers once the chain reaches it;
- **billing**: a step is charged when it answers; Apollo is charged whenever it is reached, because it
  returned a profile on all 19 calls it served in the benchmark (two of them with a differing name);
- **monthly cost** = new addresses per day × (1 − skipped personal/role share) × 30 × cost per address.

If a price or a rate changes in `README.md`, change it in `calc.js` and update the `calc.assumptions`
array in every locale file. The static examples table (rendered by the generator from the same function)
is what a browser without JavaScript shows; the interactive version replaces it. All calculator strings
come from the locale file through `data-` attributes on `#calc`; there is no inline script or style.

## Screenshots

```bash
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright npm run store:assets
```

That script loads the real extension in headless Chromium against a synthetic Gmail page, with every
provider host blocked, and writes both the Chrome Web Store kit (`store/`) and the site images
(`site-src/assets/screenshots/`, plus `load-unpacked.png`, a screenshot of `chrome://extensions` with
developer mode on). The two people who are "found" in the demo thread get the illustrated avatars from
`site-src/assets/avatars/`, served from a routed test host because the panel only renders https photo
URLs; nothing is downloaded. If you change the extension UI, rerun it, then `npm run site`.
No real addresses, names or mail content are used, and none may be added.

## The install button and the Chrome Web Store

The extension is not on the Chrome Web Store yet, so every install button links to the install guide of
its own language (`/install`, `/ja/install`, …) and keeps `data-store-url="CWS_PLACEHOLDER"`.
Each one is marked with a `CWS-BUTTON` comment in `site-src/pages/`. When the listing is live:

1. Search for `CWS-BUTTON` in `site-src/pages/` (index, install, clearbit, rapportive).
2. Point the buttons at the store URL, change the labels in `site-src/locales/*.json`
   (`index.hero.install` and the `ctaInstall` keys), and drop `CWS_PLACEHOLDER`.
3. Update the sentence under the hero button and the `install.fine` note, then run `npm run site`.

## Deploy: Cloudflare Workers Static Assets

`senderfinder.com` is served by a Worker with static assets, configured in `wrangler.toml` at the
repository root — do not change it for content updates:

```toml
[assets]
directory = "./site"
html_handling = "auto-trailing-slash"
not_found_handling = "404-page"
```

```bash
npm run site && npm test      # then commit site/ with the sources
npx wrangler deploy           # from the repository root
```

`site/.assetsignore` (generated from `site-src/.assetsignore`) keeps `README.md` out of the upload.
`site/_headers` sets response headers, including
`Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; …`.
`script-src 'self'` exists for `theme-boot.js`, `theme.js` and `calc.js`; there are no inline scripts
or styles anywhere.

## Local preview

```bash
python3 -m http.server -d site 8000     # then open http://localhost:8000/
```

Open a file directly (`site/index.html`) and links, the switcher and the theme still work; only the
extensionless URLs (`/install`) need a server.
