# Contributing

## Human work only

This project does not accept AI generated code, text, or assets. Every contribution must be written by a human.

In the pull request, you must state that the work is human written. You must list any tool you used for spelling or formatting only.

A maintainer may close a pull request that looks machine generated. There is no debate.

## Keep the code plain

- No build step.
- No runtime dependencies.
- No frameworks.
- No minified code.

Prettier is the only development tool. It formats the files and nothing else. Run `npm run format` before a pull request.

The repository ships a pre-commit hook in .githooks. Enable it once:

```
git config core.hooksPath .githooks
```

## Keep the English simple

Write short sentences. Use one idea per sentence. Do not use em dashes.

## Colors

The opencode.ai dark theme tokens in styles.css are the single source of truth for colors. Do not add color values in other files.

## Test before a pull request

1. Run `node --check app.js`.
2. Run `npm run format:check`.
3. Open the page in the browser.
4. Load models from a test endpoint.
5. Check that the generated JSON parses.

## Commit messages

Use a short imperative subject line. Lowercase is fine.

## Report a bug

Include these items in the bug report:

- What you did.
- What you expected.
- What happened.
- The browser and its version.
- The endpoint type if the bug concerns model loading.
- The steps to reproduce.
- Any error text from the browser console.
