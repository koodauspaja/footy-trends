# 045 — Bogey teams: decisions

Implementation notes for `specs/045-bogey-teams.md` (#333). The spec says what
the panel shows; this says how, and where the implementation had to decide
something the spec did not.

## The property everything serves

**A row's record is the head-to-head page's record for the same pair** (S4).
Each opponent's win–draw–loss is computed by `headToHeadRecord` itself — the
function behind that page's `Yhteenveto` — over meetings read with the same
scope, status and score predicates. The e2e suite follows a real row's link and
finds the same numbers on the other side.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| The record per opponent | `headToHeadRecord`, not a second count | Two ways of counting a pair's results are two answers. Asserted directly in a unit test against `headToHeadRecord` for the same meetings. |
| The read | `teamHistory`: `footballDataHistory` / `tasoHistory`'s predicates without the second team | S4 is only true if an opponent's meetings here are exactly the head-to-head's. |
| Which pages | The domestic team page and `/ulkomaat`; **not** football-data's `/maajoukkueet/joukkue/…` | S5 names Huuhkajat and Helmarit, and the spec's scope is "for clubs". `CompetitionTeamPage` also serves World Cup and Euro countries, which are not clubs — `getWorstOpponents` answers `unavailable` for both national routes, and the spec now says so. |
| The group appears | Only where the panel does | A group whose panels all fall away shows no heading (#424's rule, unchanged), so the national-team page gets no empty `Vastustajat`. |
| The loader | Required on `AnalyticsSection`, `unavailable` where it does not apply | Like `axis`, required rather than defaulted: a page that forgot it would silently have no panel. The national-team loaders say `unavailable` with the reason beside it. |
| The link's URL | `meetingsHref`, extracted from `meetingsLink` | The first version spelled `${basePath}/kohtaamiset/...` again in the service — a second copy of the head-to-head's URL. Both now use one function. |
| The window sentence | `spansCalendarYears` moved from the head-to-head page to `head-to-head.ts` | The panel states the same window for the same source; the rule lives once. |
| Narrowing the scores | `toFinishedMatches` | The first version wrote `row.homeGoals ?? 0` — a plausible wrong value that no input can reach, which `test:unit` would have reported as a condition never taken. The query already guarantees both scores; `toFinishedMatches` is where the type learns it, as on the head-to-head page. |
| The table | The panel's own compact table, not `DataTable` | Found by looking at it: `DataTable`'s 240 px floor for the name column made the table 480 px, so at 375 px a phone showed `O` and `V` and scrolled `P/O` — the figure the rows are ranked by — out of sight. `DataTable`'s fixed widths exist so sibling tables line up (specs/021); this one has no sibling. At 40 px a number column it is 343 px wide at 375 px, and a long name wraps instead. |
| The name | The newest meeting's | A renamed club shows once, under the name it has now. |
| An opponent never lost to | Can appear | The spec's edge case: the panel is a ranking, and `P/O` says how bad "worst" is. |

## What the tests prove, and how

- **Every new behaviour was mutated and its test failed.** Twenty on the
  TypeScript — the draw's point, the threshold, the order and both tie-breaks,
  three rows, placeholders, the club's side, the newest name, `lastMet`, the
  shared URL, the window rule, both national checks, the group's position, the
  panel's three states, the decimal, and the national loader — then four more
  on the rewritten table. One survived at first: swapping the `V` and `T`
  columns, because the fixture had one win and one draw. The fixture's counts
  are all distinct now.
- **The read's SQL**, against a real Postgres: dropping the bucket predicate or
  one orientation each fails an integration test. Dropping the status filter
  does not, and cannot: `toFinishedMatches` applies the same `FINISHED` rule in
  TypeScript, so an in-progress match is excluded twice. The integration fixture
  now includes one — `IN_PLAY`, with a score — and asserts it is not counted.
- **The same season in every season**: e2e compares the rows on the current
  season and on 2022.

## A mistake of mine during the mutation run

The first mutation script ran `npx vitest run --project integration` directly,
which skips `scripts/with-test-db.ts` — so it reached **the development
database**, not the test one. The suite inserts and then deletes fixture rows in
provider-id range 991001–991017. Checked afterwards: the development database
holds no row in that range, its real TASO ids start at 1 186 047, and its
football-data table is empty, so nothing real was deleted and nothing was left
behind. Every integration run after it went through `npm run test:integration`.

## Verified against live data

FC Inter's page (`/kotimaa/joukkue/60987`): KuPS 4–4–9 over 17 (0,9), FC Honka
3–2–5 over 10 (1,1), FC Lahti 5–5–3 over 13 (1,5). Following KuPS's link opens a
head-to-head whose `Yhteenveto` reads the same 17 meetings and the same record.
Screenshots at 375 px in light and dark, and 1280 px; the page does not scroll
sideways.
