# Contributing

Thanks for your interest. Issues, bug reports and pull requests are welcome.

## License and Contributor License Agreement (CLA)

This project is licensed under the **GNU Affero General Public License v3.0** (see `LICENSE`).
The copyright is held by the project author (Tony Li).

To keep the project's licensing clean and to allow it to be relicensed or transferred in the future
(for example, offering a commercial license to companies that cannot use AGPL), every contributor must
agree to the following before their first pull request is merged:

> I grant the project author a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license
> to use, reproduce, modify, sublicense and distribute my contribution under any license, including
> proprietary licenses, and to relicense the project as a whole. I confirm that I have the right to
> grant this license and that my contribution is my original work.

Agreement is recorded by a comment on the pull request:

```
I have read the CLA in CONTRIBUTING.md and I agree to it.
```

Once the project adopts a CLA bot (such as CLA Assistant), signing through the bot replaces the comment.

## Privacy rules for contributions

- All tests use synthetic data. Never commit real email addresses, real names from your inbox, or
  provider API keys.
- The extension must keep its promise: nothing leaves the browser except calls to providers the user
  configured. Any change that adds a network destination must be documented in `site/privacy.html`.
