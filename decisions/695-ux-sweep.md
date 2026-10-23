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
| Which pages | One of each kind, 31, in `tests/support/ux-pages.ts`, shared by the screenshots and the e2e test | A list kept twice drifts. One of each kind is enough, because pages of a kind share their components |
| Which views | 375 px and 1 024 px, light and dark, signed in and out: eight per page | A phone's width and a laptop's, as the specs' acceptance criteria name them, and signed in is where the analytics are |
| Signed in | A real session: `tests/support/e2e-session.ts` stores a reader of its own for each run, and an admin for the admin's pages, in one transaction with its session, and signs their session cookie with the server's `BETTER_AUTH_SECRET` as better-call signs one. A unit test checks the signature against better-call's own | Miikka allowed lifting the analytics' sign-in requirement locally for this, but never pushed. The first run used the e2e header, `x-e2e-analytics`, which needs no change either, but reaches the analytics only: `/asetukset` and `/yllapito` read the session on the server and showed signed out. A real session reaches every page as a reader sees it |
| Which statuses | Every page 200 but the 404 page; the admin page shows a not-found page to anyone but an admin, still 200 | decisions/028: a streamed response's status is sent before `notFound()` runs |
| Tall pages | Screenshotted in slices of 1 600 px | A reader, human or model, can see a slice whole. MSC 2025's standings page is fifteen of them at 375 px |
| A run | Starts with the services check e2e has, always with the TASO stand-in, clears its output first, and records a view that fails and goes on; the run fails at the end if any view failed or answered an unexpected status | TASO's recorded data, so its state never decides a sweep; football-data is read as the e2e suite reads it, its answers kept between runs in the stand-in's Redis. A stale screenshot beside fresh ones would mislead |
| What a test can check | No page scrolls sideways, at 375 px and 1 024 px signed in, each page answering its expected status: `tests/e2e/no-sideways-scroll.spec.ts`. Sideways is the document's scroll width past its client width, which leaves out a scrollbar | The sweep measured it on all 248 views, and found none. A rule only written down is not a check (`skills/self-review.md`, section 8) |

## Findings

All 31 pages were read: about 30 slices in the first pass, chosen to cover each
kind of page at both widths and in both themes, and a completion pass over every
page the first one left. Each group is filed: #696 headings and spacing, #697
hiding and showing panels (a feature), #698 long lists open by default, #699
tables on a phone, #700 charts, #701 links and switches, #702 the surprises
panel's empty line (a bug), #703 wording. The list, and the cases the completion
pass and the real-session run added to them, are on #695 and the issues.

## The skill

`skills/ui-review.md` has one class for each group, each with the issue it came
from, and the screenshots as its procedure. Like `skills/self-review.md`, it is
measured, not general advice: a class earns its place by a finding, and a rule a
test can check becomes the test.
