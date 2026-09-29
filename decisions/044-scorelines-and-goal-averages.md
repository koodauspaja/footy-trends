# 044 — Scorelines and goal averages between two teams: decisions

Implementation notes for `specs/044-scorelines-and-goal-averages.md` (#337,
joined with #338). The spec says what the two sections show; this says how, and
where the implementation had to decide something the spec did not.

## The property everything serves

**Both sections describe exactly the meetings the list below them shows.** The
grid, the grouping and the page's own `Kohtaamiset` are all read from one array
of meetings, so the grid's counts and the averages' `Ottelut` each add up to the
number of rows listed. The e2e suite asserts both sums against a real pair.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the arithmetic lives | Pure, in `head-to-head.ts`, beside `headToHeadRecord` | The same reason the record is there: identical whichever table a row came from, and reachable by a test without a page. |
| The grid's shape | `rows`, each naming its first-team goals, each cell its second-team goals | A plain `number[][]` made the renderer key React elements on array indexes, which Biome rejects for good reason. The grid now carries its own goal values, so the key is the score. |
| Counting cells | A map keyed by the capped score, not an indexed array | The array version needed a guard the compiler demanded and no input could trip, which `test:unit` then reported as a condition never taken. The map has no such branch. |
| The most common scoreline | Uncapped, and empty below a count of two | The sentence names a real score — `7–0`, not `5+–0`. S8 is "no sentence when the top count is 1", which is also the one-meeting case: the spec's first draft said a single meeting showed `…, 1 kerran.`, contradicting S8, and was corrected before implementation. |
| Tied scorelines, three or more | `kukin`; two are `kumpikin` | Finnish distinguishes "each of two" from "each of several". The spec's example was for two; it now names both. |
| Order of tied scorelines | The first team's goals, then the second's | Deterministic, and a reader scanning `0–0, 1–1 ja 2–1` reads it in the grid's own order. |
| A competition, per provider | football-data's `competition_code`; TASO's registry code through `competitionCodeForCategory`, else the category id | Liigacup's `LC2023` and `LC` are one row (specs/043). A category the registry does not claim is its own row rather than dropped, since its meetings are in the list. |
| A competition-season (S7) | football-data: the code and its season ids. TASO: each `(competition_id, category_id)` pair met in | TASO's `competition_id` is already a season (`spljp24`, `Liigacup24`), so the pair is exact — and a season's other categories stay out, which the integration test asserts with an Ykkösliigacup row in the same `Liigacup90`. |
| Pairing averages with rows | `getCompetitionAverages` returns **the groups it was given**, each with its average attached | The first version returned a parallel list zipped back by index, with a `??` fallback that — had it ever fired — would have printed the pair's own average as the competition's. Attaching the value to its group removes the pairing, and the fallback with it. |
| An empty scope | A failure (S10), not `0,0 – 0,0` | The pair's own meetings are in every scope, so an empty one means two reads disagree about what counts. Reported, not rendered. |
| The gate | `loadAnalysis` asks `canSeeAnalytics()` before computing anything | S6: a signed-out page carries no count or average. The unit test asserts neither the averages read nor the grid's markup happens signed out. |
| Loading | Awaited in `HeadToHeadPage`, rendered by plain components | The first version nested async components in the JSX, which the test renderer cannot draw — every test on the page failed, specs/042's included. `AnalyticsSection` is awaited by the team pages for the same reason. |
| Shading | Four steps of `color-mix` from the theme's foreground into its background, with background-coloured text on the two darkest | One hue, light to dark, correct in both themes because it is built from their own tokens. `ceil`, so a filled cell is never drawn empty however small its share. Every filled cell prints its count, so colour is never the only way to read it. |
| The averages table at 375 px | `DataTable`, scrolling sideways inside its own wrapper | The site's table behaviour below its minimum width, and what the meeting list directly beneath already does. The page itself does not scroll sideways, checked at 375 px in light and dark. |
| Decimals | `formatDecimal` from the line chart | The one decimal-comma formatter the app has; a second would be a second rule. |

## What the tests prove, and how

- **Every new behaviour was mutated and its test failed.** Eighteen mutations
  on the TypeScript — orientation, both caps, S8, tie order, the away average,
  group order, both deduplications, the gate, S9, the registry key, `kukin`,
  `5+`, the shading's `ceil`, the dark cells' text, S10 and the empty-scope
  check — each failed at least one test. Two survived the first pass (`ceil` →
  `round`, and the dark-cell text colour) and got tests of their own.
- **S7 is proved in SQL**, against a real Postgres: dropping the football-data
  season clause fails two integration tests, dropping TASO's category clause
  one.
- **A shuffled run found a test inheriting its neighbour**: the signed-in
  `beforeEach` leaked into specs/042's tests, which then saw four sections. A
  file-level `beforeEach` now starts every test signed out.
- **`float8` arrives as a number** from the driver — the integration test
  compares with `toEqual` on numbers, so the `Number(...)` wrapper the first
  version carried was removed rather than kept "to be safe".

## Verified against live data

On FC Inter v AC Oulu (`/kotimaa/kohtaamiset/60987/60493`), nine meetings in
Veikkausliiga and Liigacup: every grid cell was checked by hand against the
list, the sentence names `2–1 ja 3–2, kumpikin 2 kertaa`, and the averages split
7 + 2. Screenshots at 375 px in light and dark, and at 1280 px.

## Analytics groups, reviewed

Asked during implementation: does this feature need a new analytics section or
group, as #424's groups on the team page would? **No.** The head-to-head page
has no group structure — `Yhteenveto`, `Tulokset`, `Maalit kilpailuittain` and
`Kohtaamiset` are its sections, as the spec names them — and one group around
two sections would separate nothing. The review of the remaining analytics
features found three that do need one, each noted on its issue for its spec to
decide:

| Issue | Needs |
|---|---|
| #333 bogey team | A team-page group for opponents across seasons, e.g. `Vastustajat` |
| #355 rivalry page | The head-to-head page's first grouping: history against now |
| #339–#342 league trends | An `Analyysit` section on competition pages, which have none |
