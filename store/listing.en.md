# Chrome Web Store listing (English, default)

Field limits: name ≤ 45 chars, summary ≤ 132 chars, description ≤ 16,000 chars. Name and summary come from
`extension/_locales/*/messages.json` (`ext_name`, `ext_description`) via the manifest and are localized automatically;
the detailed description below is pasted into the dashboard per language.

## Name
SenderFinder

## Summary (from manifest, 129 chars)
Shows the LinkedIn profile of the sender in Gmail / Outlook web. Open source, your own provider keys, data stays in your browser.

## Category
Workflow & Planning (alternative: Communication)

## Language
English (default). Localized store listings available for: 简体中文, 繁體中文, 日本語, 한국어, Deutsch, Français, Español, Português (Brasil), Italiano.

## Detailed description

Find the email sender on LinkedIn, without leaving your inbox.

Open a message in Gmail (or Outlook on the web) and the side panel shows who wrote it: photo, name, title, company, location, their local time, a link to their LinkedIn profile and, when available, their X / Twitter. Everyone else in the thread is listed underneath; one click looks any of them up. A small magnifier next to the sender's name is all that is added to the mail page itself.

SenderFinder is the open-source successor to the Rapportive / Clearbit Connect idea, built for people who live in their inbox: sales, business development, recruiting, partnerships, founders.

HOW IT WORKS
• Free first: the email signature is scanned on your device for a linkedin.com/in link. Hit → done, $0.
• Then a waterfall of data providers, cheapest first, which stops at the first hit. Every call is price-checked against your per-lookup cap and your daily budget before it is sent.
• Results are cached in your browser, so the same address is never paid for twice.
• Only the sender of the message you open is looked up automatically (up to a daily limit you set); the other people in the thread wait for your click. Personal mailboxes (gmail.com, outlook.com …) and role addresses (info@, support@ …) are skipped unless you ask.

BRING YOUR OWN KEYS
There is no SenderFinder account and no SenderFinder server. You paste your own key from a data provider into the settings page, and lookups go straight from your browser to that provider. One key is enough:
• treg — cheapest, email-only reverse lookups (BlitzAPI, QuickEnrich, Village), from $0.0005 per hit.
• Monid — best coverage; Hunter by email, Apollo by email + name + company domain (about $0.03).
• Firecrawl — optional last fallback (Data Legion).
Add two for the full waterfall. Typical cost on a benchmark of 50 verified work addresses: 96 % found with a matching name, about $0.011 per address.

CONNECT ON LINKEDIN
The Connect button opens the person's profile and pre-fills an invitation note from your template (first name, company). You click Connect, Add a note and Send yourself; the extension never sends anything on your behalf. This needs access to linkedin.com, which is requested only when you first use it and can be revoked at any time.

YOUR DATA STAYS WITH YOU
• Keys live in the extension's storage on this device and are sent only to the provider they belong to.
• Only the email address, display name and company domain are sent to a provider. The message body is never transmitted.
• Only professional fields are kept (name, title, company, location, LinkedIn URL); phone numbers and personal email addresses returned by a provider are discarded.
• History, cache and spend ledger are in your browser's IndexedDB: export as JSON or CSV, or wipe everything, from the Data tab.
• Anonymous daily usage counts (how many lookups ran and how they ended, never an address, name or profile) are sent once a day to help the project; one switch turns them off, and you can preview exactly what would be sent.

FOR TEAMS IN THE EU / UK
You are the controller of the lookups you run; the privacy policy explains the lawful basis, data minimisation, retention (90 days by default) and how to answer a request from someone you looked up. https://senderfinder.com/privacy

OPEN SOURCE
AGPL-3.0, every claim on this page can be checked in the code: https://github.com/astonysh/SenderFinder
Works in Gmail; Outlook on the web (outlook.live.com, outlook.office.com) is supported on a best-effort basis. Available in English, Chinese (Simplified and Traditional), Japanese, Korean, German, French, Spanish, Portuguese (Brazil) and Italian.

SenderFinder is not affiliated with LinkedIn, Google, Microsoft or any data provider.

## Links
- Homepage: https://senderfinder.com
- Support: https://github.com/astonysh/SenderFinder/issues
- Privacy policy: https://senderfinder.com/privacy
