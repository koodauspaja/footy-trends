# 695 — A UX sweep of every page, and the pass that keeps it

Until this sweep, UI was checked one feature at a time: each spec's UX section,
`skills/open-pr.md`'s "light and dark at 375 px", and the `dark-mode` and
`team-page-fold` e2e specs. Nothing looked at a page as a whole, and Miikka had
seen pages crowded with elements that touched and analytics that could not be
hidden. This sweep looked at every kind of page, filed what it found, and turned
the findings into `skills/ui-review.md`.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| How the pages are seen | `npm run ux:screenshots`: its own Playwright config on top of `playwright.config.ts`, so the same server, TASO stand-in, port and test database, run from `tests/ux` with the list reporter alone | The e2e suite's setup already has data on every page. Its freshness reporter would record a screenshot run as a passing e2e run, which the pre-push hook trusts, so the sweep uses no reporter but the list |
| Which pages | One of each kind, 28, in `tests/support/ux-pages.ts`, shared by the screenshots and the e2e test | A list kept twice drifts. One of each kind is enough, because pages of a kind share their components |
| Which views | 375 px and 1 024 px, light and dark, signed in and out: eight per page | A phone's width and a laptop's, as the specs' acceptance criteria name them, and signed in is where the analytics are |
| Signed in | The e2e suite's header, `x-e2e-analytics: signed-in`, which counts only with `E2E_ANALYTICS_OVERRIDE` and a test database (decisions/030, decisions/304) | Miikka allowed lifting the analytics' sign-in requirement locally for this, but never pushed. The header made lifting it unnecessary |
| Tall pages | Screenshotted in slices of 1 600 px | A reader, human or model, can see a slice whole. MSC 2025's standings page is fifteen of them at 375 px |
| What a test can check | No page scrolls sideways, at 375 px and 1 024 px signed in: `tests/e2e/no-sideways-scroll.spec.ts` | The sweep measured it on all 224 views, and found none. A rule only written down is not a check (`skills/self-review.md`, section 8) |
| What the sweep cannot see | `/asetukset` and `/yllapito` signed in | Both read the session on the server, and the e2e session helper intercepts only the client's call |

## Findings

All 28 pages were read: about 30 slices in the first pass, chosen to cover each
kind of page at both widths and in both themes, and a completion pass over every
page the first one left. Each group is filed: #696 headings and spacing, #697
hiding and showing panels (a feature), #698 long lists open by default, #699
tables on a phone, #700 charts, #701 links and switches, #702 the surprises
panel's empty line (a bug), #703 wording. The list, and the cases the completion
pass added to them, are on #695.

## The skill

`skills/ui-review.md` has one class for each group, each with the issue it came
from, and the screenshots as its procedure. Like `skills/self-review.md`, it is
measured, not general advice: a class earns its place by a finding, and a rule a
test can check becomes the test.
