# Notes for the Chrome Web Store reviewer

No signup or paid provider key is required to test the free path.

1. Install the extension and open https://mail.google.com. Open a message whose body/signature includes a public `linkedin.com/in/...` profile URL (or send yourself one).
2. Click the extension icon to open the side panel. The sender card should show the link found in the message, marked as an email-signature result at $0. Other people in the thread appear below with a Look up action.
3. Open Settings → Provider keys. With no key configured, paid-provider steps are skipped. A lookup from a message without a profile URL will show that no provider key is set; the reviewer will not be charged.

LinkedIn features are optional. When the reviewer chooses “Show photos and your LinkedIn relationship” or “Connect”, Chrome asks for optional LinkedIn access. The extension uses the reviewer's own LinkedIn session to read connection degree, profile photo and associated company links for the selected profile. For Connect, it opens the profile; in the invitation dialog it clicks “Add a note” once and fills the note template. It never clicks Connect or Send. No LinkedIn permission is requested until the reviewer starts one of these features.

Anonymous usage statistics are on by default: Settings → "Anonymous usage statistics" → "Preview what would be sent" shows the exact document (daily counts and a random installation ID only; never an address, name or profile). One switch turns them off and deletes the ID and anything unsent. The receiving code is in the repository (telemetry/).

Source: https://github.com/astonysh/SenderFinder. The upload archive is built with `npm run zip -- --store`; it contains all extension features and no private signing key.
