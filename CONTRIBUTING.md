# Contributing to Chronos

Thanks for helping improve Chronos!

## Setup

```sh
npm install
npm run dev
```

`npm install` also enables the repo's git hooks (see below).

## Linting

This plugin follows the [Obsidian plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines), enforced through `eslint-plugin-obsidianmd`. **Please only open PRs with properly linted code.**

Before opening a PR, run:

```sh
npm run lint          # report lint problems
npm run lint:fix      # auto-fix what can be fixed
npm run format        # format with Prettier
npm run format:check  # verify formatting
npm run build         # type-check and bundle
```

A PR should have no lint errors, no new warnings where reasonable, and be Prettier-formatted.

Tips:

- Prefer fixing the underlying issue (proper types, `void`/`await` on promises, CSS classes instead of inline styles) over disabling a rule.
- If a disable comment is truly necessary, scope it narrowly (`eslint-disable-next-line`) and include a description explaining why.
- For UI text, brand names such as Chronos are configured as exceptions to the sentence-case rule in `eslint.config.mjs`. Add new proper nouns there.

## Git hook

A `pre-push` hook (in `.githooks/`) runs the linter and the Prettier check and prints a warning if problems are found. It never blocks your push. It's a reminder, not a gate.

If hooks aren't active, run `npm run prepare` once.

## Pull requests

- Keep PRs focused on one change.
- Describe what changed and why, and how you tested it.
- Make sure `npm run lint` and `npm run build` pass.
