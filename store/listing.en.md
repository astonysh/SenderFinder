# Chrome Web Store listing (English, default)

Field limits: name ≤ 45 chars, summary ≤ 132 chars, description ≤ 16,000 chars. Name and summary come from
`extension/_locales/en/messages.json` (`ext_name`, `ext_description`) via the manifest. The detailed description below is pasted into the dashboard.

## Name
SenderFinder

## Summary (from manifest)
Shows the LinkedIn profile of the sender in Gmail / Outlook web. Open source, your own provider keys, data stays in your browser.

## Category
Workflow & Planning (alternative: Communication)

## Language
English (default). The extension UI supports 10 languages: English, Simplified and Traditional Chinese, Japanese, Korean, German, French, Spanish, Brazilian Portuguese and Italian. Add store listing translations separately in the dashboard.

## Detailed description

Find the email sender on LinkedIn, without leaving your inbox.

Open a message in Gmail (or Outlook on the web) and the side panel shows who wrote it: photo, name, title, company, location, local time, a LinkedIn profile link and, when available, X / Twitter. Everyone else in the thread is listed underneath; one click looks any of them up. A small magnifier next to the sender's name is all that is added to the mail page itself.

SenderFinder is an open-source successor to the Rapportive / Clearbit Connect idea, built for people who live in their inbox: sales, business development, recruiting, partnerships and founders.

HOW IT WORKS
• Free first: the email body is scanned locally for a linkedin.com/in link. If one is found, the lookup ends there at $0.
• Then a waterfall of data providers, cheapest first, stops at the first hit. Each call is price-checked against your per-lookup cap and daily budget.
• Results are cached in your browser, so the same address is not paid for twice.
• Only the sender of the message you open is looked up automatically (up to a daily limit you set); other people in the thread wait for your click. Personal mailboxes and role addresses are skipped unless you ask.

BRING YOUR OWN KEYS
There is no SenderFinder account, and no SenderFinder server in the lookup path. You paste your own key from a data provider into the settings page, and lookups go straight from your browser to that provider. One key is enough:
• treg — email-only reverse lookups (BlitzAPI, QuickEnrich, Village), from $0.0005 per hit.
• Monid — Hunter by email, Apollo by email + name + company domain (about $0.03).
• Firecrawl — optional last fallback (Data Legion).
Add two for the full waterfall. Typical cost on a benchmark of 50 verified work addresses: 96% found with a matching name, about $0.011 per address.

CONNECT ON LINKEDIN
When you choose a LinkedIn feature, SenderFinder can use your own LinkedIn session to read the connection degree, profile photo and associated company links for the selected profile. The Connect button opens the person's profile. In the invitation dialog, SenderFinder clicks “Add a note” once and fills in your editable note template. You must click Connect and Send yourself; SenderFinder never clicks either button. LinkedIn access is optional and can be revoked in settings.

WHERE DATA GOES
• Provider keys are stored in this browser and sent only to their corresponding provider when you request a lookup.
• A lookup sends the selected person's email address, display name and company domain to the provider you configured. Some providers may forward the request to their disclosed downstream providers under their own terms.
• The open email body is scanned locally for a LinkedIn profile link; it is not stored or transmitted. Only professional profile fields are kept; returned phone numbers and personal email addresses are discarded.
• Lookup history, cache and spend ledger stay in your browser's IndexedDB. You can export or clear them in the Data tab.
• Anonymous daily usage counts (how many lookups ran and how they ended, provider-step counts, mail client, rounded spend, extension version, UI language and a random installation ID; never an address, name, domain, LinkedIn URL, profile field, key or message content) are sent once a day to the project's Cloudflare Worker to help the project. They are on by default; one switch in settings turns them off and deletes the installation ID and anything unsent, and you can preview exactly what would be sent.

FOR TEAMS IN THE EU / UK
You decide whom to look up and which provider to use. The privacy policy explains data minimisation, retention (90 days by default), and how to respond to a request from someone you looked up: https://senderfinder.com/privacy

OPEN SOURCE
AGPL-3.0; claims on this page can be checked in the code: https://github.com/astonysh/SenderFinder
Works in Gmail; Outlook on the web (outlook.live.com, outlook.office.com) is supported on a best-effort basis. SenderFinder is not affiliated with LinkedIn, Google, Microsoft or any data provider.

## Links
- Homepage: https://senderfinder.com
- Support: https://github.com/astonysh/SenderFinder/issues
- Privacy policy: https://senderfinder.com/privacy
