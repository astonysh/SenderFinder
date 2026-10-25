# Chrome Web Store → "Privacy practices" tab

## Single purpose description

Show the professional profile of an email sender beside the message in Gmail or Outlook on the web, and help the user connect with that person on LinkedIn when the user chooses to do so.

## Permission justifications

| Permission | Justification |
|---|---|
| `storage` | Stores provider keys, settings, the pending anonymous daily usage counters, and the user's local lookup cache. Lookup addresses and results stay in the browser except when the user requests a lookup from a configured provider. |
| `alarms` | Removes expired local cache entries and, while the anonymous usage statistics switch is on (on by default, one switch in settings turns it off), posts one daily aggregate usage summary. |
| `scripting` | Injects bundled Gmail/Outlook content scripts into matching mail tabs, and injects the bundled LinkedIn helper into a LinkedIn profile tab opened by the user through the extension after the user grants LinkedIn access. The helper fills an invitation note after clicking “Add a note” once; it does not click Connect or Send. No remote code is loaded or executed. |
| `sidePanel` | Displays the sender's professional profile beside the open email. |
| Host `https://mail.google.com/*` | Reads the sender and participants of the open message and scans its body locally for a LinkedIn profile link. The body is not stored or transmitted. When the user requests a lookup, the selected person's email address, display name and company domain are sent to the provider configured by the user. |
| Host `https://outlook.live.com/*`, `https://outlook.office.com/*`, `https://outlook.office365.com/*` | Same as Gmail, for Outlook on the web. |
| Host `https://api.monid.ai/*`, `https://treg.to/*`, `https://api.firecrawl.dev/*` | Sends user-requested lookup fields and the matching provider key directly from the browser to the configured provider. Some configured providers are aggregators and may forward requests to their disclosed downstream providers under their own terms. The extension also reads provider price catalogs to enforce the user's budget. |
| Optional `cookies` + optional host `https://www.linkedin.com/*` | Requested only when the user chooses a LinkedIn feature. The extension uses the user's own LinkedIn session, including the `JSESSIONID` cookie as a CSRF value, to request connection degree, profile photo, and associated company names/links for the selected profile. When the user chooses Connect, the extension opens the selected profile and clicks “Add a note” once in the invitation dialog, then fills the user's note template. It never clicks Connect or Send. The helper runs only in the LinkedIn tab opened by this feature; permission can be revoked in settings. |

## Remote code

No. All executable code is bundled in the extension package. No code is fetched from a server or evaluated at runtime.

## Data usage: “What user data do you plan to collect from users now or in the future?”

Tick:

- [x] **Personally identifiable information** — when the user requests a lookup, the selected person's email address, display name and company domain are sent directly to the data provider the user configured, using that provider's key. Some providers may forward the request to their disclosed downstream providers. SenderFinder does not receive lookup addresses or provider results.
- [x] **Authentication information** — provider API keys are stored locally and sent only to their respective providers. For LinkedIn features, the extension reads the user's `JSESSIONID` cookie locally to construct requests to LinkedIn using the user's own session; the cookie is not sent to SenderFinder or a data provider.
- [x] **Personal communications** — the open email body is read locally only to scan for a LinkedIn profile link. It is not stored or transmitted.
- [x] **Website content** — the extension reads sender/participant fields and the message body in Gmail/Outlook, and, after the user grants LinkedIn access, reads the selected LinkedIn profile's connection degree, photo and associated company names/links through the user's own session. Mail content is processed locally; LinkedIn requests go to LinkedIn.
- [x] **User activity** — anonymous daily usage counts (lookup totals and outcomes, provider-step counts, mail-client totals, rounded spend, version, language and a random installation ID) are posted once a day to the project's own statistics service (Cloudflare Worker + D1, code in `telemetry/`). The switch is on by default and the user can turn it off at any time in settings; turning it off deletes the installation ID and anything unsent. No address, name, domain, profile field, key or message content is ever included.

Leave unticked: Health, Financial and payment, Location, Web history.

## Certifications

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases. Lookup fields go only to the provider the user configured (and any downstream provider it discloses) to perform that user-requested lookup. Anonymous aggregate usage counts go to the project's own statistics service and can be switched off at any time.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Privacy policy URL

https://senderfinder.com/privacy (must be live and reachable before submitting)
