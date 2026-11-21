# 847 — The unit run prints test results and nothing else: decisions

Chore #847. CI's unit test step printed warnings and stderr between its results
(read from PR #845's run). Each had a source in this repository, and each is
gone. A reporter now fails the run if anything prints again.

## What printed, and why

| Output | Source | Fix |
|---|---|---|
| Vite: the config "uses features that are unsupported by `configLoader: 'native'`" | `package.json` had no `"type"`, so `vitest.config.ts` and the `.ts` module it imports were CommonJS by Node's rules, while written as ES modules | `"type": "module"`, below |
| `[ioredis] Unhandled error event`, four or five times | `tests/unit/app/foreign/match/[id]/page.test.tsx` did not mock `@/lib/predictions/poisson-service`. `getPoissonFit` ran for real and connected to Redis. CI has no Redis. Locally Docker's Redis answered, so it never printed there | The test mocks it, returning the `{ status: "error" }` the real call returned without Redis and Postgres |
| React: "Encountered two children with the same key, `reader-1`" | The `NAMED` fixture in `tests/unit/components/admin-user-table.test.tsx` was `{ ...READER, nickname }`, so a table holding both had one id twice | `NAMED` is a user of its own: `reader-2`, `nimetty@example.fi` |
| jsdom: "Not implemented: navigation to another Document", three times | Three tests in `tests/unit/components/account-menu.test.tsx` click a real link, and jsdom cannot follow it | The file cancels a click's default action at the document, after the menu has handled it. The tests check that the menu closes, which is unchanged |
| "30 doc comments run past twelve lines; the longest: …" | `tests/unit/scripts/checks/comment-rules.test.ts` printed it on purpose (`decisions/531-comments-say-what-code-is-for.md`) | Removed, with `longDocComments` behind it, below |

## Decisions

| Decision | Why |
|---|---|
| `package.json` declares `"type": "module"`, `vitest.config.ts` uses `import.meta.dirname`, imports its one local module with its `.ts` extension, and `tsconfig.json` allows that (`allowImportingTsExtensions`, permitted because the project sets `noEmit`) | The fix the warning itself names. Setting `VITE_CONFIG_NATIVE_IGNORE_WARNING` would only hide it. Nothing else in the repository used CommonJS: the `require(…)` strings in three tests are code run by `node -e`, which is CommonJS whatever the package says. Scripts find out whether they are the entry point from `argv`, not from `require.main`. Typecheck, lint, the unit and integration suites, e2e and `next build` pass with it |
| The comment-rules test's twelve-line report is removed, with `longDocComments` | It overrides the report in `decisions/531-comments-say-what-code-is-for.md` ("reported, never failed on"). `decisions/839-mechanical-comment-rules.md` now fails a comment whose prose runs over three lines, which covers what the report pointed at. A report nobody acts on is the noise this chore removes |
| `scripts/checks/console-output-reporter.ts` fails `npm run test:unit` and `npm run test:shuffle` when anything is printed to the console, naming the test, the file, or "outside any test" for each message | Every message above went unnoticed because nothing failed. A reporter sees every message from every worker, including one printed after its test ended, as the Redis errors were. A setup-file spy would miss those |
| A test that expects output silences it with `vi.spyOn(console, …)` and asserts on the spy | A spied call never reaches the reporter, and the assertion keeps the message from being silenced by accident. There is no list of allowed messages to keep up |
| The reporter is added on the command line of `test:unit` and `test:shuffle`, beside the default reporter, not in `vitest.config.ts` | The integration suite shares the configuration, and this chore covers the unit run only |
| The default export is a subclass taking no arguments; the class with an injectable writer is exported beside it | Vitest constructs a reporter with its own options object. The first version took the writer as an optional constructor argument, and Vitest's options landed in it |

## How the noise was found

The unit suite was run with Redis pointed at a closed port, and with
`--reporter=verbose`. Vitest's default reporter did not show these messages on a
local terminal, though CI's log has them. That is why they went unnoticed locally.
