# SenderFinder website

Static website for the SenderFinder Chrome extension. Plain HTML and one CSS file.
There is no build step, no framework, no npm packages and no external requests.

## Files

| File | Purpose |
|---|---|
| `index.html` | Landing page |
| `clearbit-connect-alternative.html` | Clearbit Connect alternative (SEO page) |
| `rapportive-alternative.html` | Rapportive alternative (SEO page) |
| `privacy.html` | Privacy statement |
| `404.html` | Not-found page (also stops Cloudflare Pages from treating the site as a single-page app) |
| `styles.css` | Shared styles, light and dark mode |
| `assets/` | Favicon and logo |
| `robots.txt`, `sitemap.xml` | Crawling |
| `_headers` | Cloudflare Pages response headers (strict Content-Security-Policy: same-origin only) |

## Deploy to Cloudflare Pages

1. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the Git repository.
2. Build settings:
   - Framework preset: **None**
   - Build command: **(leave empty)**
   - Build output directory: **`site`**
3. Save and deploy. Add a custom domain under the project's Custom domains tab if you want one.

Cloudflare Pages serves `/privacy.html` at `/privacy` (it redirects `.html` URLs to the extensionless form).
Canonical URLs and `sitemap.xml` therefore use extensionless paths. Internal links keep `.html` so the pages
also work when opened straight from disk.

Direct upload works too: `npx wrangler pages deploy site` (run from the repository root).

## Placeholders

Replace these before going live. Each is a plain string, so one search-and-replace across `site/` is enough.
Every HTML file also lists them in a comment block at the top.

| Placeholder | Replace with | Where |
|---|---|---|
| `CWS_PLACEHOLDER` | Chrome Web Store listing URL | Install buttons (`data-store-url`, see below) |

### When the Chrome Web Store listing is live

Until then, the install buttons read "Coming to the Chrome Web Store" and link to the
install-from-source section of the GitHub README (`#install-from-source`; make sure that heading exists).
Each button is marked with a `CWS-BUTTON` comment. To switch:

1. Search for `CWS-BUTTON` (one per page: `index.html`, `clearbit-connect-alternative.html`, `rapportive-alternative.html`).
2. Set the button's `href` to the store URL (the value you'd put in `CWS_PLACEHOLDER`) and change the label to "Add to Chrome".
3. Update the short note under the button on `index.html` and the "Until the Chrome Web Store listing is live" sentences.

## Local preview

Open `index.html` in a browser, or serve the folder: `python3 -m http.server -d site 8000`.
