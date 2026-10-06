# 041 — Analytics for the national teams: decisions

Implementation notes for `specs/041-national-team-analytics.md` (#459). The spec
says what the pages show; this says how, and where the implementation had to
decide something the spec did not.

## The property everything serves

**A page's panels are about the period that page actually has.** The national
teams have no season — they have a history and a set of calendar years — so
every figure, every heading and every label on these two pages names one of
those two, and never a season. Each decision below is that rule applied
somewhere: to the identity the figures are keyed on, to the axis, to the
strings, and to the one field that used to mean two things.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Finland's identity | `FINLAND_TEAM_ID = -1`, written on Finland's side by `normalizeFinlandId` at the read boundary | The spec's S1 and S2. All eight analytics functions take a `teamId: number`; teaching each to match `"Suomi"` instead would put the name in eight modules and leave every club page carrying a branch it never takes. The mutation that handles only the home side fails 2 tests. |
| Where it is applied | Inside `loadSeason`, beside `isFinlandMatch` | The one place that has already worked out which side Finland is. Applied in the loaders instead it would be applied nine times, and the ninth would be the one that forgot. |
| The two axes | `nationalTeamAnalytics` builds seven loaders from the whole history and two from calendar years | The spec's S3 and S4. `comparisonFor` and `recordsFor` take `{ competitionCode, seasonId }` keys, so a year becomes a period under one synthetic code — `NATIONAL_TEAM_PERIOD_CODE`. One code for every year is also what lets `recordsFor` join them, since it joins only consecutive periods of the same competition: that is how a run crosses 31 December. |
| The period's wording | **One `AnalyticsAxis` per page**, not a flag per string | S11 and S13 together name six strings. Six props would let a page say `Tämä vuosi verrattuna` under a group called `Muut kaudet`, which is worse than saying neither. `SEASON_AXIS` and `HISTORY_AXIS` are the only two the app has, and the prop is required so a new page cannot quietly claim its panels are about a season. |
| The chart legend | Also from the axis | Not in the spec, and **found by looking at the page**: the first build read `Tämä vuosi verrattuna` in the heading and `Tämä kausi` in the legend directly beneath it. `SELECTED_LABEL` is gone; `BASELINE_LABEL` (`Tavallisesti`) stays shared, because it names no period. |
| `StreakRecordsSeries.competitions` | **Replaced by `scope: string`**, built by the caller | The spec left this open deliberately. A list of competition names that sometimes held a span of years would be two meanings in one field — the pair that drifts, and the same field already shipped unrendered once in #425. `competitionScope` is exported for the two club services, so the join lives in one place rather than at each call site. |
| The section's place | Above the year list, once | S5. It describes every year, so it cannot sit inside one. |
| A partial history | Still gets its analytics | The `incomplete` notice already says the history may be short. A partial history is still a history — the same trade #180 made for the list itself. Stated here because the alternative is defensible and the page gives no other sign. |

## What the tests prove, and how

- **The identity, in both directions**: the sentinel lands on Finland at home
  and away, the opponent keeps the id TASO sent, and a match Finland is not in
  comes back untouched.
- **The two axes are not the same**: five matches over three years fill exactly
  one five-match form window and one five-point clean-sheet series, while the
  comparison sees 2 other periods and names them `2024`, `2025`. A test using
  one year would pass for either axis.
- **A record crosses the year boundary** — three wins from 2025 into 2026 are
  one run — and its line reads `2025–2026` rather than a competition name.
- **The club pages are unchanged**: `Tämä kausi verrattuna`, `Muut kaudet` and
  the `Kausi 2024` wording are asserted on the season axis in the same files.
- **Twelve mutations, all caught**: the history unreversed, the selected year
  ignoring whether anything was played, the span losing its end, a period named
  by code, Finland found only at home, the `Sijoitus` row kept, either group
  heading reverted, the records naming competitions, the legend hardcoded, the
  page put on the season axis, and the comparison heading reverted.

### One mutation escaped first time

Reverting `HISTORY_AXIS.comparisonHeading` to `Tämä kausi verrattuna` broke no
unit test — only the e2e. A heading is the first thing a reader sees, so the
unit suite now pins it at the render site.

### `history()` sorts for its own sake

Every panel re-sorts by kickoff through `teamMatchesInOrder`, so reversing the
service's newest-first years is **not** load-bearing for any figure — the
mutation that drops it fails only the test of `history` itself. It stays because
a function called `history` returning its matches backwards is a trap for the
next caller, and it costs one `reverse`.

## Looked at, rather than inferred

Both teams, both themes, at 375 px, with Playwright screenshots read back:

- the three groups read `Ottelu ottelulta`, `Koko historia`, `Muut vuodet`;
- no `Sijoitus kierroksittain`, and no `Sijoitus` row in the comparison;
- `Verrattuna 8 muuhun vuoteen: 2018, 2019, …` on Helmarit, 84 matches on the
  axis and still legible at that width;
- `Ennätykset` headed `2018–2026`, with a record reading `Vuodet 2020–2021` —
  which is S4's boundary-crossing run, visible on the page.

That is also how the legend was caught. The first screenshot pass is what
turned two settled decisions into three.

## Two things review caught

Both from Sourcery on the first push, and both real:

- **`Ennätykset` could name a year it read nothing from.** The span was built
  from every year the page holds, so in January — when the newest bucket carries
  fixtures and no results — it would have read `2018–2026` while 2026
  contributed no record. `readYear` now answers `empty` for a year with no
  finished match, which is the rule `selectedYear` already applied at the other
  end, and the span is built from the years `recordsFor` actually read. The same
  fix keeps such a year out of the comparison's baseline, where it was
  contributing a period worth nothing.
- **`selectedYear` ran before the sign-in gate**, because it was computed while
  the loaders were being built. Cheap, but the surrounding comment claimed a
  signed-out request computes nothing, and it no longer quite did. It moved
  inside `loadComparison`.

## Left open, deliberately

- **`Kääntyneet ottelut` says `Puoliaikatulos puuttuu 76 ottelusta.`** on
  Huuhkajat, because TASO stores no half-time score for most older national
  matches. The panel's existing line already says so; making it say more is a
  change to what that panel shows, which specs/041 puts out of scope.
- **The opponent pages** under `/maajoukkueet/joukkue/[id]` are football-data
  club pages and keep the season axis. Nothing here touches them.

## Moved from comments, 2026-10-06

Cut from `src/lib/national-team.ts` at `a86c1cb` by #531.

- **`FINLAND_TEAM_ID`.** TASO publishes no id for Finland that is stable across
  categories, which is why `isFinlandMatch` matches the name, while all eight
  analytics functions take a `teamId` and compare it against the home or away
  id. One reserved id is the only thing that is stable, so the read boundary
  writes it on Finland's side and every function works untouched. Nothing
  stores it, nothing fetches by it, and no URL carries it.
- **`normalizeFinlandId`.** Applied once, beside the filter that already knows
  which side Finland is. The opponent's id is left as TASO sent it, because
  the match page and the head-to-head still read it. A match Finland is not
  in cannot reach the pages, since `isFinlandMatch` runs first, but a
  transformation that quietly relabelled another team's id would be worse
  than one that does nothing.

Cut from `src/lib/national-team-analytics.ts` at `a86c1cb` by #531.

- **`national-team-analytics.ts`.** Pure. Every other team page's panels come
  from a service that fetches a season; this page already holds its whole
  history by the time the section renders, so there is nothing to fetch and
  no cache to add. The page has no season, hence the two axes: `Ottelu
  ottelulta` and `Koko historia` read every finished match since 2018 in
  kickoff order; `Muut vuodet` reads the newest year against every earlier
  one, and records that run across all of them. The loaders are thunks, so a
  signed-out request computes nothing: `AnalyticsSection` checks the gate
  before calling any of them.
- **`NATIONAL_TEAM_PERIOD_CODE`.** `comparisonFor` and `recordsFor` tell periods
  apart by `{ competitionCode, seasonId }`, and `recordsFor` joins two periods
  into one run only when the code matches and the years are consecutive. It
  is never looked up in a competition registry: a year names itself.
- **`history`.** `getNationalTeamYears` answers newest year first with each
  year's matches chronological, which is right for reading down the page and
  backwards for a chart, so the years are reversed and their matches kept.
- **`finishedHistory`.** Typed as the narrowed match and not as `SeasonMatch`:
  `Kääntyneet ottelut` needs the half-time score, and widening would hide it
  from the one panel that reads it.
- **`selectedYear`.** Finished, not merely scheduled: a year whose fixtures are
  all ahead of it has nothing to compare. In January that makes last year the
  selected one, the most recent football there is.
- **`yearSpan`.** In January the newest bucket carries fixtures and no results,
  and a span reaching through it would claim coverage of a year nothing was
  read from. `recordsFor` passes the contributing years in, so the span cannot
  disagree with the panel. An en dash, as every range in the app.
- **`readYear`.** `points` is empty and `teamCount` 0 because there is no
  table: `seasonLength` finds no rounds, the share falls back to the whole
  period, and the panel is asked for `UNRANKED_MEASURES`, so it shows no
  `Sijoitus` row. `competition` is the year, because a year spans
  friendlies, qualifiers and a tournament at once. A year with no finished
  match is `empty` and not an empty period: counting it would let both panels
  describe a year they read nothing from.

Cut from `src/lib/streak-records.ts` at `94397a8` by #531.

- **`StreakRecords.scope`.** The panel says what its records cover because a
  reader on a club's cup page could otherwise take them for the club's own.
  Built by the caller because what identifies the run differs by page: a club
  page names the competitions, a national-team page the span of years. One
  field holding names that sometimes held years would be two meanings in one
  place.
- **`competitionScope`.** Shared by both providers: they differ in how a
  season is read and in nothing about how it is named.

Cut from `src/lib/national-team-service.ts` at `ef7eb13` by #531.

- **`normalizeFinlandId` in `loadSeason`.** The analytics functions all key
  on an id.

Cut from `src/components/analytics-section.tsx` at `ef7eb13` by #531.

- **`axis` on `AnalyticsSection`.** A page that forgot it would quietly
  claim its panels were about a season.

Cut from `src/components/national-team-page.tsx` at `dc74e3e` by #531.

- **The analytics on a national team's page.** The panels cannot sit inside
  one year. The loaders are computed from `result.years`, so the section adds
  no query and no provider request. They stay thunks because
  `AnalyticsSection` checks the sign-in gate before calling any of them, and
  a signed-out page must carry no computed value at all. The `incomplete`
  notice already says the history may be short, and a partial history is
  still a history: the same trade as on the list itself.

Cut from `src/lib/analytics-axis.ts` at `ef99862` by #531.

- **`AnalyticsAxis`.** A national-team page has no season at all, so its
  charts run across the whole history and only `Muut vuodet` reads years as
  periods. One value per page and not one flag per string: the panels spelled
  `kausi` into their own headings, and a page that says
  `Tämä vuosi verrattuna` under a group called `Muut kaudet` is worse than
  one that says neither. Picking the axis picks every word at once, so a
  page cannot disagree with itself, and the two constants are the only two
  axes the app has.
- **`SEASON_AXIS`.** Its strings are the ones the season comparison and the
  record book were written with.

Cut from `src/components/charts/season-comparison-chart.tsx` at `ef99862` by #531.

- **`BASELINE_LABEL`.** The filled column is `Tämä kausi` on a club page and
  `Tämä vuosi` on a national-team one.

Cut from `src/components/season-comparison-section.tsx` at `48ebab4` by #531.

- **The comparison panel's strings.** The ones naming a period are a season
  on a club page and a calendar year on a national-team page.
