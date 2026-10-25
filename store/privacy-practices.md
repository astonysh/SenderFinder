# Chrome Web Store → "Privacy practices" tab: what to enter

Every field below is required before the item can be submitted. Texts are ready to paste.

## Single purpose description
Show the LinkedIn profile (name, title, company, location, profile link) of the sender of the email the user has open in Gmail or Outlook on the web, using data providers the user configures with their own API keys.

## Permission justifications

| Permission | Justification |
|---|---|
| `storage` | Stores the user's provider keys, settings, and a local cache of lookup results so the same address is not paid for twice. Nothing is synced or sent to us. |
| `alarms` | A daily alarm prunes expired cache entries and, if the user left the switch on, posts the anonymous daily usage count. |
| `scripting` | After an install or update, injects the content script into Gmail / Outlook tabs that are already open, so the user does not have to reload them. Only the extension's own bundled files are injected; no remote code. |
| `sidePanel` | The profile of the sender is shown in Chrome's side panel next to the mailbox. |
| Host `https://mail.google.com/*` | Content script reads the sender and participants of the open message and scans the message body locally for a linkedin.com/in link. Nothing from the page is transmitted except the email address, display name and company domain of the person being looked up, and only to the provider the user configured. |
| Host `https://outlook.live.com/*`, `https://outlook.office.com/*`, `https://outlook.office365.com/*` | Same as Gmail, for Outlook on the web. |
| Host `https://api.monid.ai/*`, `https://treg.to/*`, `https://api.firecrawl.dev/*` | The data providers. Lookups are sent from the browser directly to the provider for which the user entered a key; the extension also reads their price catalogs (free) to enforce the user's budget before each call. |
| Optional `cookies` + optional host `https://www.linkedin.com/*` | Requested only when the user first clicks "Connect" or "Show photos and your LinkedIn relationship". Used to open the person's LinkedIn profile in a tab the extension created and pre-fill the invitation note the user then sends themselves, and to read the relationship degree / photo from the user's own LinkedIn session. Never runs on LinkedIn pages the user opened themselves; revocable in settings. |

## Are you using remote code?
No. All code is bundled in the package; nothing is fetched or evaluated at runtime.

## Data usage: "What user data do you plan to collect from users now or in the future?"
Tick:
- [x] **Personally identifiable information** — the email address and display name of the person being looked up (taken from the open message) are sent to the data provider the user chose, using the user's own key. They are not sent to the developer.
- [x] **Website content** — the sender/participant fields and the body of the open message are read in the page; the body is scanned locally for a LinkedIn link and never transmitted.

Leave unticked: Health, Financial and payment, Authentication information (keys are stored locally and sent only to their own provider as a bearer token; the developer never receives them — if a reviewer asks, this can be ticked with that explanation), Personal communications (message content is not collected or transmitted), Location, Web history, User activity.

## Certifications (tick all three)
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

## Privacy policy URL
https://senderfinder.com/privacy  (must be live and reachable before submitting)
