# 384 — A DOM only where a test needs one: decisions

Chore #384 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `vitest.config.ts` at `5b180e0` by #531.

- **A DOM only where a test needs one.** `environment: "jsdom"` for
  everything built one for all 139 unit files while only 52 of them touch a
  DOM, and constructing it dominated the run: across the whole suite,
  `environment` accounted for about 290 s of cumulative worker time against
  about 93 s running tests. The 65 `tests/unit/lib` files alone took 26.3 s
  under jsdom and 9.0 s under node, with `environment` falling from 158.74 s
  to 7 ms and every test still passing. The split is by extension because
  that is where the line falls, checked: running the whole suite under
  `node`, the 52 files that failed were every `.tsx` file bar
  `app/layout.test.tsx`, and no `.ts` file at all. A new test that needs a
  DOM says so by its extension, a rule nobody has to remember. The setup
  file, the alias and the plugins are shared by both projects.
- **The integration project.** When the unit projects were the only ones,
  `npm run test:integration` matched nothing, and `--passWithNoTests`
  reported that as a pass, so a CI job ran zero tests and went green.
  `scripts/with-test-db.ts` points the suite at the test database.

Cut from `playwright.config.ts` at `5b180e0` by #531.

- **The e2e assertion timeout.** Playwright's default is 5 s, while a page
  render waits up to 10 s for TASO and 8 s for football-data before giving
  up. So whenever a provider was merely slow, an assertion expired while the
  server was still doing what it is supposed to do, and the run failed for a
  reason that had nothing to do with the page: the whole of the e2e
  flakiness seen then. 15 s is derived from the render timeout and not
  chosen for comfort.

Cut from `tests/support/unit-env.ts` at `79f2c6a` by #531.

- **`unit-env.ts`.** `vitest.config.ts` loads `.env` so the integration
  suite can reach Postgres and Redis, and that file is unavoidably in scope
  for the unit suite too. A unit test that reads a variable from it passes
  on a laptop and fails on a runner, where nothing sets it: a `beforeAll`
  imported `@/lib/auth`, which refuses to construct without
  `BETTER_AUTH_SECRET`, passed locally and skipped twenty tests in CI.
  `vi.stubEnv` is explicit and behaves the same in both places. The list is
  read from `.env.example`, because a copy would drift the moment somebody
  adds a variable, silently, in the direction that lets a test depend on a
  laptop again.
- **`LOG_LEVEL` under `unit-env.ts`.** The config deletes the value `.env`
  supplies while keeping one the developer exported, so
  `LOG_LEVEL=debug npm run test:unit` still works. Removing it here would
  take that away for no gain, since CI sets it no more than it sets the
  rest.

Cut from `tests/support/warm-module.ts` at `79f2c6a` by #531.

- **`warmModules`.** `vi.resetModules()` clears module instances before
  every test, but not Vite's transform cache, so the first import of a
  page's graph costs seconds while every later one costs tens of
  milliseconds. Left in the test body, that one-off consumed most of a five
  second budget and timed out at random, on a test that had done nothing
  slow. A helper and not fifteen hand-written hooks, because both halves are
  easy to get wrong, and one already was.
- **The warming hook swallows a failure.** Only the transform is wanted.
  Without the `catch`, `@/lib/auth` took twenty tests down with it in CI,
  where no `.env` exists. A hook that silently succeeds is correct; a test
  that needs the module to load will say so itself.
- **`WARM_HOOK_TIMEOUT_MS`.** This is the one place in the suite that
  legitimately spends seconds, as setup. Raising the global `hookTimeout`
  would hand the same allowance to every other hook, including ones written
  later for unrelated reasons, which is how a genuine hang stops being
  visible. Twenty seconds is measured: a reporter on `onHookStart` and
  `onHookEnd` put the slowest hook at 6.2 s on a developer machine, with
  every file warming, itself the peak, since the hooks contend with each
  other; the same hook measured 3.3 s when only fifteen files had one. The
  10 s default leaves 1.6x over that, which a slower runner can eat; 20 s
  leaves about 3x. If the numbers drift, measure again.
