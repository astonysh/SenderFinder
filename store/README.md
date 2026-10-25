# Chrome Web Store submission kit

Everything in this folder is generated or hand-written for the store listing. Regenerate the images with
`npm run store:assets` (uses synthetic people only; nothing real, no provider call).

| File | Dashboard field | Spec |
|---|---|---|
| `screenshot-1-sender.png` … `screenshot-5-data.png` | Store listing → Screenshots (1–5) | 1280×800 PNG, no alpha |
| `promo-small.png` | Store listing → Small promo tile (required) | 440×280 PNG |
| `promo-marquee.png` | Store listing → Marquee promo tile (optional) | 1400×560 PNG |
| `extension/icons/icon128.png` | Store icon (taken from the package) | 128×128 |
| `listing.en.md` | Store listing → Description (English) + category, links | ≤ 16,000 chars |
| `listing.zh_CN.md` | Store listing → Description, language 中文（简体） | |
| `privacy-practices.md` | Privacy practices tab: single purpose, permission justifications, data usage, certifications, policy URL | |
| `review-notes.md` | Package / Distribution → Notes for reviewers | |

## Submission order

1. **Account.** Register the developer account (one-time $5), enable 2-step verification, verify the contact email.
   Consider a dedicated publisher account/email rather than a personal one; it is shown publicly.
2. **Site live first.** https://senderfinder.com/privacy must resolve (the privacy policy URL is validated) and the
   homepage must exist for the "Official website" link. Deploy `site/` before step 4.
3. **Build.** `npm test && npm run e2e`, then `npm run zip -- --store --with-key` for the first upload
   (`key.pem` inside keeps the extension id `extension/manifest.json` already pins), `npm run zip -- --store` for updates.
   The store build strips the `key` field from the manifest; everything else is identical to `extension/`.
4. **New item → upload** `output/senderfinder-<version>-store.zip`.
5. **Store listing tab:** paste `listing.en.md` (description, category, language), upload the 5 screenshots and the two
   promo tiles, set the official URL (https://senderfinder.com) and support URL (GitHub issues). Add the zh_CN listing
   under "Add language"; the other 8 languages take the localized name/summary from the manifest automatically and can
   get full descriptions later.
6. **Privacy practices tab:** copy `privacy-practices.md` field by field. All permission justifications and the three
   certifications are mandatory.
7. **Distribution tab:** Public, all regions, free.
8. **Submit for review** with `review-notes.md` in the reviewer notes. Expect 1–3 business days; a first submission
   with host permissions on mail.google.com and a `scripting` permission sometimes gets a question about the
   content-script injection — the justification text in `privacy-practices.md` answers it.

## After approval

- Tag the release on GitHub (`v<version>`) and attach the same zip.
- Put the store link on the website and in the README ("Install from the Chrome Web Store" above "Install from source").
- Each later release: `npm run bump -- patch|minor "summary"`, tests, `npm run zip -- --store`, upload, submit.
