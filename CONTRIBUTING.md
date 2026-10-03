# Contributing

Thank you for helping. This guide is short on purpose.

## Set up

You need Node 20 or later.

```sh
npm ci
```

## Run the checks

CI runs these in this order on Node 20, 22 and 24. Run them before you open a pull request.

```sh
npm run typecheck
npm run lint
npm run format:check
npm run coverage
npm run build
npm run smoke
```

`npm run format` fixes formatting for you, Markdown included. `npm test` runs the tests alone.

## Fixtures must be synthetic

Every file under `test/fixtures` is invented. Never commit a real feed, or a piece of one, not even trimmed down.

Real feeds contain personal data, such as names, phone numbers and email addresses of agents and vendors. They can also carry credentials in the root element. Once something is in git history it is very hard to remove.

Use the same conventions as the existing fixtures:

- Agent IDs like `XNWTEST` and unique IDs like `TEST0001`.
- Streets like `Example Street` and `Sample Road`, in suburbs like `Testville` and `Mockford`.
- Postcodes `0000` to `0009`.
- Email addresses at `example.com`, and phone numbers such as `0491 570 006`.
- Placeholder passwords that look like placeholders.

## Keep the README example in sync

The quick start in `README.md` is run by the test suite. The same code lives in `test/readme.test.ts`, in the function `quickStart`. The two copies are kept in sync by hand. When you change one, change the other, and update the printed output under the README example. The tests fail if they differ.

The same test file checks that every diagnostic code appears in the trap table with the right severity, and that the command-line samples in the README match the real output. If you add a diagnostic code, add its row to the table.

## Commit style

- Write one short subject line in the imperative, such as `Add inspection time parsing`.
- Start with a capital letter and do not end with a full stop.
- Say why in the body when the reason is not obvious.
- Keep each commit to one change, with its tests.

## Writing style

In documentation and messages, use short sentences and plain words. Do not use em dashes, en dashes or exclamation marks.
