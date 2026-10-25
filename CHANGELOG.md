# Changelog

## 0.5.1 (2026-10-25)

- Fix: buttons sometimes needed a second click. The side panel no longer re-renders while a pointer is pressed (a focus, relationship refresh or state push used to replace the pressed button and Chrome dropped the click), and the magnifier chip asks the side panel to open before the worker awaits anything, so the user gesture no longer expires after a cold start.

## 0.5.0 (2026-10-25)

- Fix: people you are already connected with showed a Connect button instead of "Connected". LinkedIn retired the `networkinfo` endpoint (410) and now returns a 1st-degree relationship as a URN link (`"*connection"`) rather than an inline object; the parser understands both, and also finds the relationship entity by member id when the profile does not link to it (TopCardSupplementary). Cached relationships are read again once (cache version 5).
- Settings: provider keys are grouped by vendor (treg / Monid / Firecrawl) with each vendor's logo and official name (Monid, not MonID). The Firecrawl "Get one" link is the referral link firecrawl.link/sf. Each box shows its key status and the steps that key unlocks with prices; a hint says at least one of treg or Monid is needed. One key alone runs the whole flow (missing-key steps are skipped), as before.
- "No key set" texts now say which key to add (treg cheapest, Monid best coverage) instead of just "open settings".
- Side panel: a result that said "no key set" clears itself once a key is saved; the main sender is looked up again automatically and the banner updates without reopening the panel. The card also offers Retry next to Open settings.
- Eight more UI languages: Traditional Chinese, Japanese, Korean, German, French, Spanish, Brazilian Portuguese, Italian. `scripts/locales.test.js` keeps every locale in step with English (keys, placeholders, store-description length); `npm run e2e:locales` screenshots the panel and settings in each language. The English store description was shortened to Chrome's 132-character limit.
- Privacy: the privacy page gains GDPR / UK GDPR sections (user as controller, lawful basis, Art. 14 transparency, retention, transfers outside the EEA, rights of people looked up, Chrome Web Store Limited Use, children), both READMEs get a compliance summary, and the About card links to the policy with a one-line responsibility note in every language.
- Chrome Web Store kit in `store/`: 5 screenshots and 2 promo tiles generated from the extension with synthetic people (`npm run store:assets`), listing texts (en, zh_CN), privacy-practices answers, reviewer notes and a submission checklist. `npm run zip -- --store` builds the upload zip with the manifest `key` stripped.
- Website deployed to senderfinder.com (and www) as a Cloudflare Worker with static assets (`wrangler.toml` at the root, `npm run site:deploy`); telemetry receiver deployed to telemetry.senderfinder.com (`npm run telemetry:deploy`).
- Side panel slogan is now "Find the email sender on LinkedIn" (zh: 找到发件人的 LinkedIn).
- README (zh + en): new "one provider is enough" section with what each key alone covers, and a note that Apollo / Hunter / ContactOut go through Monid (an Apollo key of your own does nothing).

## 0.4.0 (2026-10-25)

- Renamed the product to SenderFinder (senderfinder.com): extension name, side panel, options, website, telemetry worker, package and zip names. New icon (envelope + magnifier) and a magnifier chip next to the sender instead of the "in" mark. Export format is now senderfinder/1; files in the old email-linkedin/1 format still import.
- Icons come from design/icon-1024.png (48, 128, website logo) and a pixel-aligned design/icon-small-32.png for the 16 px toolbar icon; `npm run icons` regenerates them. Favicon matches.
- The invitation note signature is now just "— sent via SenderFinder". GitHub links point to github.com/astonysh/SenderFinder.

## 0.3.2 (2026-10-25)

- Content scripts: every observer tick and the i18n helper tolerate an invalidated extension context

## 0.3.1 (2026-10-25)

- Content scripts go quiet after the extension is reloaded instead of throwing 'Extension context invalidated' in Gmail / Outlook tabs that stayed open

Versions are the extension's `manifest.json` version; `npm run bump -- patch|minor|major "summary"` raises it in both
`manifest.json` and `package.json` and opens a section here. Bump on every change that users reload.

## 0.3.0 (2026-10-25)

- Side panel replaces the inline Gmail card: the sender of the opened message is the main card, everyone else in the thread is listed below and looked up on click; the mail page only gets a small "in" chip. Found participants offer the same actions as the main card (profile, Connect, Details).
- Connect on LinkedIn: the panel opens the person's profile and prepares an invitation note from an editable template, ending with a "sent via Email → LinkedIn" line (the product name at the time). The extension no longer clicks Connect (LinkedIn ignores scripted clicks and the layout changes); you click Connect yourself and the note box is filled in the moment it appears, including inside shadow DOM. The banner offers "Copy note" and "Copy details for a bug report".
- English UI by default, Simplified Chinese when the browser runs in Chinese (`_locales/en`, `_locales/zh_CN`).
- Anonymous daily usage statistics, on by default with a one-click switch; opting out deletes the installation id and anything unsent. Privacy page updated accordingly.
- Fixed extension id via a `key` in the manifest: reloading from any folder keeps keys, cache and history.
- Options page restyled (sections and hairlines, one radius, no cards-in-cards); History tab rebuilt as a list of people with one-line actions and a working "Load more". Website and side panel restyled the same way.
- Fixed: stray "null" in participant rows; "Load more" and "Revoke" buttons shown when they should be hidden.

## 0.2.0 (2026-10-25)

- No server any more: the waterfall, provider clients and cache moved into the extension (IndexedDB). Bring your own Monid / treg / Firecrawl keys in the settings page.
- Only the sender of the opened message is looked up automatically, with a daily limit; other participants wait for a click.
- Options page with settings, history, statistics and JSON export / import; migration script for the v0.1 SQLite database.

## 0.1.0 (2026-10-25)

- First version: Node server + SQLite + web app, Gmail card talking to the server (kept on git tag `v0.1-server`).
