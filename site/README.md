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

## Deploy (Cloudflare Workers Static Assets)

The site is served by a Cloudflare Worker that only hosts static assets (Cloudflare's successor to Pages; the
`wrangler pages` commands now redirect to this flow). The config is `wrangler.toml` in the repository root:
`assets.directory = "./site"`, both custom domains (`senderfinder.com`, `www.senderfinder.com`), request logging off.

```bash
npm run site:deploy        # = npx wrangler deploy, from the repository root; needs `npx wrangler login` once
```

What the platform does for us: `_headers` is applied, `/privacy.html` redirects to `/privacy` and `/privacy` serves
`privacy.html` (`html_handling = "auto-trailing-slash"`), unknown paths get `404.html`, and files listed in
`.assetsignore` (this README) are not uploaded. Canonical URLs and `sitemap.xml` use the extensionless paths;
internal links keep `.html` so the pages also work when opened straight from disk.

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
