# Notes for the Chrome Web Store reviewer (paste into "Notes for reviewers" / test instructions)

SenderFinder has no account and no server of its own. It shows, in Chrome's side panel, the LinkedIn profile of the
sender of the email open in Gmail or Outlook on the web. Lookups use third-party data providers with API keys the user
pastes into the settings page; without a key the extension still works on the free path.

How to test without any key (no paid provider is called):
1. Install, open https://mail.google.com and open any message whose signature contains a linkedin.com/in link
   (or send yourself one: a few lines of text followed by https://www.linkedin.com/in/<any-public-slug>).
2. Click the extension icon to open the side panel. The sender card shows the LinkedIn link found in the signature
   ("Source: email signature", cost $0). Other people in the thread are listed below with a "Look up" button.
3. Settings (gear icon) → Provider keys: each provider box shows "missing key"; the lookup steps that need a key are
   skipped, which is also what the row says when you click "Look up" on someone without a signature link ("No key set").

Optional, to see a paid lookup: create a free account at https://treg.to, paste the token in Settings → treg; opening a
message from a work address then fills the card from the provider (typically $0.0005 per hit, billed to that account).

"Connect on LinkedIn": clicking Connect on a found person first shows a page asking for the optional linkedin.com
permission (Chrome's prompt follows). After granting, the profile opens in a new tab; the extension only pre-fills the
note once the user has clicked "Connect" and "Add a note" on LinkedIn themselves, and never clicks Send.

Anonymous usage statistics: Settings → "Anonymous usage statistics" → "Preview what would be sent" shows the exact
document (daily counts only). The receiving code is in the repository (telemetry/).

Source code: https://github.com/astonysh/SenderFinder — the zip is built from `extension/` with `npm run zip -- --store`.
