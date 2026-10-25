# Browser store submission kit

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
3. **Build.** `npm run zip -- --store`. Never put `extension-key.pem` or any private key in the upload or release archive.
   The store build strips the development `key` field from the manifest. After the first upload, use the Package tab's
   **View public key** value in `extension/manifest.json` if you want locally loaded builds to use the store item ID.
4. **New item → upload** `output/senderfinder-<version>-store.zip`.
5. **Store listing tab:** paste `listing.en.md` (description, category, language), upload the 5 screenshots and the two
   promo tiles, set the official URL (https://senderfinder.com) and support URL (GitHub issues). Add the zh_CN listing
   under "Add language". Check the displayed name and summary for every language in the dashboard; do not assume they
   were imported automatically from the manifest. Full store descriptions are currently prepared in English and zh_CN.
6. **Privacy practices tab:** copy `privacy-practices.md` field by field. All permission justifications and the three
   certifications are mandatory.
7. **Distribution tab:** Public, all regions, free.
8. **Submit for review** with `review-notes.md` in the reviewer notes. Expect 1–3 business days; a first submission
   with host permissions on mail.google.com and a `scripting` permission sometimes gets a question about the
   content-script injection — the justification text in `privacy-practices.md` answers it.

## After approval

- Tag the release on GitHub (`v<version>`) and attach the same zip (which must not contain private signing keys).
- Put the store link on the website and in the README ("Install from the Chrome Web Store" above "Install from source").
- Each later release: `npm run bump -- patch|minor "summary"`, tests, `npm run zip -- --store`, upload, submit.

## Microsoft Edge Add-ons updates

SenderFinder is live at https://microsoftedge.microsoft.com/addons/detail/senderfinder/pfgdkmjokjkalbpeapkdfopomdapnmki.

1. Run `npm run zip:edge` to create `output/senderfinder-edge-<version>.zip`; the development public key is stripped.
2. In Partner Center, open the existing SenderFinder item, choose Update, and replace its package.
3. Use the shared `listing.en.md` and `listing.zh_CN.md` descriptions. The package includes short descriptions for all 10 languages; review the dashboard’s imported text for every language. Preserve existing screenshots unless newer assets are supplied.
4. Add the version’s release notes and reviewer instructions, then submit for certification. A submitted update is not live until the store completes certification and publishing.

## Automated Edge package updates

Microsoft’s Update REST API supports uploading a package to an existing product, checking upload status, submitting its draft for certification, and checking publication status. Store descriptions and other listing metadata still require Partner Center.

Use the v1.1 authentication scheme: API Key and Client ID from Partner Center’s Publish API page. Store credentials in local secret storage or CI secrets, never in this repository or chat. SenderFinder product ID: `e29bfc9a-64dd-4a2d-83be-eee965037989`.

The automation sequence is: build with `npm run zip:edge`, upload, wait for verification, submit with reviewer notes, then report certification/publication status. Submitting does not mean the update is immediately live.

Official documentation: https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api
