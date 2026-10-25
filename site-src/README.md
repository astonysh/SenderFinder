# SenderFinder website

Design adapted from [ixartz/SaaS-Boilerplate](https://github.com/ixartz/SaaS-Boilerplate) (MIT, © 2026 Remi W.):
the spacing scale, typography, gradient accents, card/button shapes and section headers. Only the design —
no code or dependency from that project is used. Every page uses that one design system in every language
it is built for
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
| `site-src/pages/*.html` | One template per page (`changelog.html` and the six English-only pages use dedicated or shared templates). `{{key}}`, `{{#each list}}…{{/each}}`, `{{#if value}}…{{/if}}` |
| `site-src/locales/<locale>.json` | Every string of every multilingual page, one file per language |
| `site-src/content/<id>.json` | Copy for English-only pages (`meta`, `page`, `faq`); never read for other languages |
| `site-src/site.config.json` | Build switches (currently `consentMode`) |
| `site-src/partials/icons.svg` | The icon sprite, inlined into every page |
| `site-src/assets/app.css` | The only stylesheet, for every page: tokens (light/dark/system), shared chrome, the marketing layout, prose pages, install steps, calculator |
| `site-src/assets/theme-boot.js` | Blocking head script: applies the saved theme and consent state before first paint |
| `site-src/assets/theme.js` | The header's theme switch and the notice at the bottom of every page |
| `site-src/assets/calc.js` | Cost model + calculator wiring; the build imports the same file for the no-JS table |
| `site-src/assets/avatars/` | Illustrated avatars used in the product screenshots |
| `site-src/assets/screenshots/` | Product screenshots, written by `npm run store:assets` |
| `site-src/_headers`, `site-src/robots.txt`, `site-src/.assetsignore` | Copied to `site/` verbatim |
| `scripts/build-site.js` | The generator: shell, hreflang, JSON-LD, sitemap, changelog, assets, icon and provider logo copies |
| `scripts/bench-stats.js` | Aggregates `data/bench/*.results.json` for the benchmark page; no personal data in its output |
| `scripts/bench-stats.test.js` | Pins the benchmark aggregates and checks the output contains no address or profile URL |

Everything in `site/` is generated, including this README, `sitemap.xml` and the asset copies.

## Pages and URL structure

English is the default and lives at the root; the other nine languages sit under a lowercase prefix.
Canonical URLs are extensionless (`wrangler.toml` uses `html_handling = "auto-trailing-slash"`, so
`/privacy` serves `privacy.html` and `/privacy.html` redirects to `/privacy`). Every internal link —
navigation, footer, brand, language switcher, in-body links — uses that canonical root-relative URL
(`/install`, `/zh-cn/privacy`, `/` for the home page). The site therefore needs a server that maps the
URLs; it no longer works when `site/index.html` is opened straight from disk. Anchors keep working
(`/#faq`, `/ja/install#which-key`).

| Page | English | Example, other languages |
|---|---|---|
| Landing page | `/` | `/ja/` |
| Install guide | `/install` | `/pt-br/install` |
| Privacy statement | `/privacy` | `/de/privacy` |
| Clearbit Connect alternative | `/clearbit-connect-alternative` | `/zh-tw/clearbit-connect-alternative` |
| Rapportive alternative | `/rapportive-alternative` | `/fr/rapportive-alternative` |
| Changelog (body from `CHANGELOG.md`) | `/changelog` | `/ja/changelog` |
| Email → LinkedIn benchmark | `/email-enrichment-api-benchmark` | — (English only) |
| Sales Navigator for Gmail alternative | `/linkedin-sales-navigator-gmail-alternative` | — (English only) |
| Find a profile from an email | `/find-linkedin-profile-from-email` | — (English only) |
| Outlook sidebar | `/outlook-linkedin-sidebar` | — (English only) |
| Sponsors | `/sponsors` | — (English only) |
| Usage statistics | `/stats` | — (English only) |
| 404 | `/404.html` (English only, `not_found_handling = "404-page"`) | — |

Every indexable page carries `<link rel="alternate" hreflang>` for every language it exists in plus
`x-default` (English), and `sitemap.xml` lists exactly those URLs with the same alternates. The language
switcher in the header is a plain `<details>` element: each language name is written in its own
language, and there is no automatic redirect by `Accept-Language` — a URL always shows the language it
names.

**English-only pages.** A page in `PAGES` can declare `locales: ['en']` (the six content pages and the
404 page do). Such a page is built only in English, carries one `en` hreflang plus `x-default`, appears
once in the sitemap, and has no locale-prefixed URL. Its language switcher points every other language
at that language's home page. The footer's **Resources** column is shown in every language with a
translated heading (`ui.footer.resources`) and English link labels, and links to the English canonical
URL (`hreflang="en"`), so no link ever points at a locale-prefixed page that does not exist. Copy for these pages lives outside the locale files, in
`site-src/content/<id>.json` (`meta`, `page`, `faq`), and is loaded only for English; see
“English-only content pages” below.

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

The hero headline uses `panel_slogan` from `extension/_locales/<locale>/messages.json` at build
time, so the site and extension share the same slogan. The home page `<title>` is
`SenderFinder — <panel_slogan>`. Supporting copy lives in `index.hero.desc`
in the website locale files.

## Structured data (JSON-LD)

The generator writes one `<script type="application/ld+json">` block into the `<head>` of every page,
from the same data the page renders (the locale files, `site-src/content/` or `CHANGELOG.md`) — never by hand. It is data, not executable script, so the
CSP (`script-src 'self'`, no inline scripts) is unchanged and stays as strict as before.

| Page | Types |
|---|---|
| Every page | `WebSite`, `Organization` (logo `/assets/icon-128.png`, `sameAs` the GitHub repository) |
| Every page except the home page | `BreadcrumbList` (home → page) |
| Home page | `SoftwareApplication` (BrowserApplication, free offer, AGPL-3.0, `softwareVersion` from `package.json`) and `FAQPage` from the six visible `faq.items` |
| Install | `HowTo` with one `HowToStep` per install step |
| Clearbit / Rapportive alternative, Changelog | `Article` with `datePublished` / `dateModified` = `UPDATED` (`scripts/build-site.js`) |
| English-only content pages | `Article` plus a `FAQPage` built from the page's own FAQ |

`scripts/site.test.js` parses the block on every page, so invalid JSON or a missing type fails the build
before it reaches `site/`.

The changelog page is generated at build time from `CHANGELOG.md`: one `<h2>` per version and one list
per bullet group. Its title, lead and note are translated in the ten locale files; the version entries
are the repository's English changelog, by design for now.

## English-only content pages

A page that only makes sense in English (the benchmark, the Sales Navigator and Outlook guides, the
email-to-profile guide, sponsors, statistics) declares `locales: ['en']` in `PAGES` and keeps its copy
in `site-src/content/<id>.json`:

```json
{
  "meta": { "title": "…", "description": "…", "ogTitle": "…", "ogDescription": "…" },
  "page": { "title": "…", "lead": "…", "sections": [ { "title": "…", "blocks": ["…"] } ] },
  "faq": [ { "q": "…", "a": "…" } ]
}
```

The build merges that object into the English page scope only: the page object is available as `page`
(the shared `site-src/pages/content.html` template) and as `{{<id>.…}}` (used by the JSON-LD and the
breadcrumb), while `faq` becomes both the visible FAQ block and `FAQPage` JSON-LD. A section can carry
`blocks`, `list`, `ordered`, `blocksAfter`, `note`, `comment` (an HTML comment, used for the
`TODO-VERIFY` and `STATS-PLACEHOLDER` markers) and a `table` with `head`, `rows` and an optional `note`.
The template reuses the existing prose and marketing classes, so the page copy stays out of the nine
translated locale files; only the shared chrome labels (`ui.footer.resources*`, `ui.benchmarkLink`) are
added to all locales, and the locale parity test keeps covering the multilingual pages. The
footer's Resources heading is translated; its link labels (`ui.footer.resourcesLinks`) stay English for
now because the six resource pages themselves are English-only.

## Adding or changing a language

1. Copy `site-src/locales/en.json` to `site-src/locales/<locale>.json` and translate the values.
   Keys, nesting and list lengths must stay identical — `npm test` compares every key and also checks
   that HTML tags and `{{placeholders}}` survive.
2. Add the language to `LANGUAGES` in `scripts/build-site.js` (locale id, `hreflang`, URL prefix, the
   language's own name for the switcher). English must stay first.
3. Run `npm run site` and `npm test`, then look at one page at 320 px, 768 px and 1280 px: long words
   wrap, CJK line height comes from the `:lang()` rules in `app.css`.

`ui.footer.resources` and `ui.footer.resourcesLinks` are English on purpose for now: the six resource
pages are English-only. Translating them is safe, but it does not localise the pages they link to.

Strings may contain inline HTML (`<a>`, `<code>`, `<strong>`) and placeholders such as `{{url.install}}`
(a root-relative link to a page of the same language). Product names — SenderFinder, Monid, treg, Firecrawl,
Apollo, Hunter, ContactOut, BlitzAPI, QuickEnrich, Village, Data Legion, LinkedIn, Gmail, Outlook —
stay untranslated. Use the same wording as that language's `extension/_locales/<locale>/messages.json`
where a term overlaps (`side panel`, `settings`, `look up`, `key`). Non-English privacy pages start with
one sentence saying the English version prevails.

## Theme, icons and the notice

- **Theme.** `assets/theme-boot.js` (a blocking classic script in `<head>`) reads `localStorage['el-theme']`
  and sets `<html data-theme="light|dark">` before first paint, exactly like the extension. Without a
  saved choice the site follows `prefers-color-scheme`. Following the system is the default and is not
  listed: the header menu only offers the opposite of the theme on screen (Light when dark, Dark when
  light), and the summary shows a sun or a moon for the theme on screen. Picking the theme the system
  already uses clears the key again. Without JavaScript the control stays hidden and the site follows the system.
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
   server and its usage counts are on by default with a switch, whatever the website does.

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

## The benchmark page

`/email-enrichment-api-benchmark` is the only page whose numbers are computed rather than written:

```bash
npm run bench -- data/bench/wizleads-sample-50.csv   # costs money, writes the results JSON
npm run site                                         # recomputes the table
npm test                                             # includes scripts/bench-stats.test.js
```

`scripts/bench-stats.js` reads `data/bench/wizleads-sample-50.results.json` and returns only aggregates:
calls, hits, conditional hit rates, final answers, observed prices, spend and per-address cost. It never
returns an address, name or profile URL; `scripts/bench-stats.test.js` asserts that and pins the current
aggregates so a silent data change is visible. `scripts/build-site.js` injects the result into the
“Results by step” section, and the prose uses `{{benchmark.stats.*}}` placeholders for the figures it
quotes. The page publishes aggregates only.

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

1. Search for `CWS-BUTTON` in `site-src/pages/` (index, install, both alternatives, content — the shared template).
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

Deploys are automatic (Cloudflare Workers Builds, connected to this GitHub repository): every push to
`main` that changes `site/*` or `wrangler.toml` runs `npx wrangler deploy` from the repository root. There is
no build command, so always regenerate and commit the output yourself:

```bash
npm run site && npm test      # then commit site/ together with site-src/ and push to main
```

Pushes to other branches create preview URLs; they do not touch senderfinder.com. A manual deploy
(`npx wrangler deploy` from the repository root) still works if the Git integration is ever disconnected.

`site/.assetsignore` (generated from `site-src/.assetsignore`) keeps `README.md` out of the upload.
`site/_headers` sets response headers, including
`Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; …`.
`script-src 'self'` exists for `theme-boot.js`, `theme.js` and `calc.js`; there are no inline scripts
or styles anywhere.

## Local preview

```bash
python3 -m http.server -d site 8000     # then open http://localhost:8000/
```

A plain static server serves `/` and the asset files, but it does not map the extensionless canonical
URLs (`/install`) to `install.html`; those need the same rewrite Cloudflare applies. For a faithful
preview, run `npx wrangler dev` from the repository root (it reads `wrangler.toml` and `html_handling`).
Opening `site/index.html` directly now leaves the internal links pointing at `/install` and friends, so
navigation and the language switcher only work through a server.
