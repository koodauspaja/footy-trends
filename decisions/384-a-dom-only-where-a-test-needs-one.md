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
