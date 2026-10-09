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
| A club against itself | **Never an opponent** | Sourcery, on this pull request: a stored row naming the club on both sides would have become a row linking to a head-to-head that refuses a team against itself. Skipped in `worstOpponents` beside the placeholder rule rather than filtered afterwards, since that is where "who counts as an opponent" is decided. |
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
- **Twelve existing e2e tests broke, and were fixed at the cause.** Five placed
  a panel by counting from the end of `Analyysit` ("comes third to last"), so
  every new panel moved them — their own comments record each earlier time. They
  now place a panel inside its #424 group (`Ennätykset` last in `Muut kaudet`,
  and so on), which a new group cannot move; swapping two panels in `Muut kaudet`
  still fails two of them. Two list the whole order on purpose and gained
  `Vaikeimmat vastustajat` at the end. Six fold tests took `page.getByRole("table")`
  to mean the match list, which stopped being true when `Analyysit` gained a
  table; they now read the first fold's table.

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

## Moved from comments, 2026-10-06

Cut from `src/lib/head-to-head.ts` at `a86c1cb` by #531.

- **`meetingsHref`.** Used by the match page's link and the opponents panel's
  rows alike.
- **`spansCalendarYears`.** The head-to-head page promises to make no provider
  request, and its first version called `getSeasonContext`, which hangs a test
  runner with no API key and made the promise false. The flag only shapes a
  label (`2023/24` against `2026`), and that is region-shaped: the foreign
  competitions' seasons cross a calendar year, the national-team ones are
  tournaments inside one summer. TASO ignores the flag. It lives here and not
  in the page because the opponents panel states the same window.
- **`OpponentRecord`.** A row and the page it links to cannot disagree, since
  both are `headToHeadRecord` over the same meetings.
- **`worstOpponents`.** The meetings arrive newest first, so an opponent is
  named as it was when last met. A bracket slot is excluded by
  `hasPlaceholderTeam`'s rule, as the head-to-head applies it.

Cut from `src/lib/match-service.ts` at `a86c1cb` by #531.

- **`getWorstOpponents`.** National teams have no panel: TASO has no id stable
  across categories for Finland or its opponents, and football-data's
  national teams are countries, not clubs.

Cut from `src/lib/national-team-analytics.ts` at `a86c1cb` by #531.

- **`loadOpponents` for a national team.** Unavailable: one country could
  split into several rows, since TASO has no id stable across categories.

Cut from `src/components/opponents-section.tsx` at `48ebab4` by #531.

- **`OpponentsTable`.** `DataTable`'s fixed widths exist so sibling tables
  line up, and its 240 px floor for the name column put this one at 480 px,
  so at 375 px a phone showed `O` and `V` and scrolled `P/O`, the figure the
  rows are ranked by, out of sight. Names wrap and do not push the numbers
  away.
