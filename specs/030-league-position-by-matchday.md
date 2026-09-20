# 030 — League position by matchday

> **Status: agreed and implemented (#412).** Miikka answered Q1–Q8 and A–D on
> 2026-09-18, and E during review, all recorded under *Decisions*.

## Summary

A line chart on the team page showing where a team stood in its league after
each matchday of a season — so a reader sees the shape of a season (a climb, a
collapse, a mid-table drift) instead of only the final table. The first chart in
the app, so it also carries the chart foundation the next three analytics
features (#327, #328, #329) build on.

## Scope

### In scope

- One team, one competition, one season: the team's position after each
  matchday, as a line.
- Both providers — football-data.org leagues and TASO leagues — through the same
  chart (#331's notes: most of what the app is for is TASO).
- **Signed-in readers only.** Source: Miikka, 2026-09-18, in chat: *"all
  analytics are for signed in users only"*.
- The chart foundation, in a form #327–#329 can reuse: an SVG line chart, a
  Finnish text alternative, theme-aware colours, and tests that assert what is
  drawn. The rendering approach is chosen in the decision record — see
  *Chart foundation* below.

### Out of scope

- More than one team on the chart (a comparison is a different feature).
- Competitions with no league table — cups, knockout rounds, national teams.
  League competitions only (Q2).
- Seasons crossed on one chart — that is #330.
- Interactivity beyond what a reader needs to read a value: no zoom, no
  brushing, no animation.
- Any new provider request. The chart reads what the app already stores.

## UX / UI (Finnish strings)

**Where:** the team page (`CompetitionTeamPage`, shared by `/ulkomaat/joukkue/{id}`
and `/kotimaa/joukkue/{id}`), below the existing content, for the competition and
season the page already has selected. It follows the page's season selector; it
adds no selector of its own. Since specs/031 the chart sits under the team page's
`Analyysit` heading, first among its charts, with `Sijoitus kierroksittain` as its
subheading.

| String | Where | Status |
|---|---|---|
| `Sijoitus kierroksittain` | section heading | settled (Q6) |
| `Kierros` | x-axis label; reuses the site's existing word | settled |
| `Sijoitus` | y-axis label. Deliberately not the standings table's column header `Sija` — Miikka, 2026-09-18: *"sija could be replaced by sijoitus"* | settled |
| `Kirjaudu sisään nähdäksesi analyysit ja trendit.` | for a signed-out reader. Since specs/031 (Q5) it is shown **once**, under `Analyysit`, in place of every chart rather than of this one. Deliberately about analytics as a whole, not this chart — signed-out readers see none of them (Q1), so #327–#329 reuse the same string. Follows the settings and favourites pages' `Kirjaudu sisään nähdäksesi …` | settled (A) |
| `Kaudella ei ole vielä pelattuja kierroksia.` | when the season has no finished matchday for this team. Miikka's correction of `Kaudelta` (Q6) | settled |
| `Sijoitusta ei voitu laskea. Yritä myöhemmin uudelleen.` | when the data cannot be read; mirrors the standings page's `Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.` | settled (Q6) |
| `Sijoitus {n}. kierroksen jälkeen: {position}.` | one row of the text alternative, per matchday | settled (Q6) |
| `Sijoitus {n}. kierroksen jälkeen: {position} (ei omaa ottelua).` | the text alternative's row for a round the team sat out, drawn as an open circle | settled (#413) |
| `Avoin pallo: joukkue ei pelannut kierroksella.` | beneath the chart, only when it has an open circle | settled (#413) |
| `Jatkosarjan sijoituksia ei voida laskea tälle kaudelle.` | below the chart, when the line stops at the end of the regular season — see *Split seasons* | settled (C) |

**Axis direction.** Position 1 is at the top, as in the table the reader already
knows. The y-axis runs from 1 to the number of teams in the league — the whole
league, also after a split — so a chart's scale is comparable between seasons.
In a league played in parallel pools it spans the team's pool, the table its
positions come from (E).

**Text alternative.** Every point on the chart is also available as text — a
table or list of matchday and position — for screen readers and for readers who
cannot read the chart. Not a summary sentence: the values.

## API & Data

**No new endpoint and no provider request.** The chart is computed on the server,
during the page render, from matches the app already stores.

**How the positions are computed — and how they are not.**

The constraint, from Miikka on 2026-09-18: *"calculating ranking per round can't
lead to x (amount of rounds) fetches from the api"*. It does not, and it does not
lead to one extra fetch either.

`getStandings({ round })` exists and computes the table after one round, but it
**bypasses the cache when a round is given** (`getStandings` in `standings-service.ts`)
and re-reads the season each time. Calling it once per matchday would be 38
database reads per page view. It is **not** used for this.

Instead the chart is computed from matches **the team page already has in hand**:

1. The team page already calls `getTeamMatches` on every render, for both
   providers (`competition-team-page.tsx` for football-data,
   `app/domestic/team/[id]/page.tsx` for TASO). That call runs the existing season sync,
   `getSyncedSeasonMatches`, which loads **the whole season's matches** — every
   team's — and only then filters to this one.
2. The chart asks for the same season through the same read. For
   football-data that read is wrapped in React's `cache()` — as the TASO
   service's already was — so within one request it happens once and serves
   both the match list and the chart. No new read.
3. For each matchday `N` from the first to the last one played, the table is
   computed from matches with `matchday ≤ N`, using **the same ranking function
   the standings table uses** (`calculateStandings`, and the TASO path's
   equivalent), and this team's position is kept.

**Request budget, per team page view:**

| | Today | With the chart |
|---|---|---|
| Provider requests (football-data) | 0, or **1 for the whole season** when the active season's stored matches are older than `FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS` | **unchanged** |
| Provider requests (TASO) | 0, or 1 for the whole season's matches, as above | + **at most 1 for the season's group rows**, and only for the active season — see below |
| Database reads of the season | 1 (inside `getTeamMatches`) | unchanged for football-data; **+1 small read** for TASO |
| Extra work | — | `N` in-memory tables |

**Why TASO needs one more read — found during implementation, 2026-09-18.** A
TASO group's table depends on the season's stored **group team rows**: they carry
points adjustments (Ykkönen 2025's −3 for FC Jazz) and decide whether a split
group's numbers are verified. The standings page reads them through
`getSyncedGroupTeams`; the TASO team page never did. Reusing that exact function
is what keeps a TASO position equal to the standings page's. Miikka chose this
over reading stored rows only, or skipping them, on 2026-09-18: *"yes, 1"*.

**How many TASO requests that can mean — bounded twice.**

- Only the **active** season refreshes. A completed season with stored rows never
  makes a TASO request again (`needsRefresh`: `seasonId < activeSeasonId`).
- The TASO response is cached in Redis for 15 minutes under a key per
  competition (`getSeasonGroups` → `getCached`, `GROUPS_CACHE_TTL_SECONDS`), and
  the standings page shares that key. A refresh inside the window reads Redis,
  not TASO — including simultaneous ones.

So the ceiling is **one TASO request per active competition per 15 minutes,
however many readers** — and none extra when the standings page has already
fetched it in that window. Never one per round.

**Measured, not estimated.** 38 tables over 380 matches — the largest league
here, 20 teams — with the real `calculateStandings`: **1.26 ms per series**, mean
of 200 runs, on a developer machine. That is less than a Redis round-trip.

**Round semantics** follow `specs/003-standings-after-selected-round.md`: a
match counts at its **matchday**, not its date, and a match with
`matchday === null` is excluded from every round. The consequence for a
postponed match is spelled out in Q4.

**Split seasons.** Veikkausliiga and several other Finnish leagues split after
the regular season (Runkosarja) into a championship group and a lower group, each
carrying the regular season's points over. The app already computes each
group's table this way (`CARRY_OVER_CONFIG` in `taso-standings-service.ts`),
and only for seasons whose carry-over has been verified against TASO's published
tables.

After the split the chart plots the team's position in the **combined** table
(Q3): the upper group's teams hold 1 to *k*, the lower group's *k* + 1 onwards.
The lower group's leader is 7th when the upper group has six teams — the
position Miikka described — whatever its points, because teams cannot cross
between groups once split.

Stated so it depends on nothing hardcoded (B):

- A team's combined position = its position in its own group's table (the one
  the standings page shows for that round) + the number of teams in every group
  ranked above it.
- Groups are ranked by **where their teams finished the regular season**: the
  group holding the regular season's leader is the upper one. Not by group id or
  group name, neither of which records the order.
- Group sizes come from the data. Six is Veikkausliiga's current shape, not a
  constant.
- Round numbers continue across the split (`withContinuedRoundNumbering`), so the
  x-axis is one continuous season.

**A league played in parallel pools is one league per pool (E).** Kakkonen
starts each season in three pools (Lohko A, B, C), and in its split seasons each
pool continues into upper and lower groups of its own; the regulations rank a
pool's top two over all its rounds, regular and continuation together. So until
the end of its continuation, a pool is treated exactly as Veikkausliiga is: the
combined position within the pool, the groups above being that pool's own, and
the y-axis spanning the pool — the table the positions come from. What follows
is the promotion playoff, a bracket, which has no line.

**Where the line stops at the split instead (C).** The chart plots a round only
where the standings page itself has a table for that round. After the split the
case with none is below, and there the line ends at the last regular-season
round, with the note in the UX table beneath it:

- **A split group whose calculation is not verified.** The standings page shows
  TASO's own numbers for it **with no round selector** (`buildGroup`, step 3,
  in `taso-standings-service.ts`). TASO publishes the current table only, not a
  history, so no round-by-round position exists to plot — computing one would be
  inventing it.
Mostly these are old seasons. The one current case is a live season in the
window after it splits and before its carry-over entry is added and verified
(#272 is how that is done): the standings page has no round selector for the new
groups then either, so the chart ends at the split until the entry lands, and
extends by itself once it does.

**Both providers.** football-data matches carry `matchday`; TASO matches carry
TASO's `round_id` as `matchday` (`schema.ts`, `taso_matches`). The two keep
separate id spaces and competition registries (`specs/026`, `specs/027`); the
chart is always for one competition of one provider, so nothing aggregates
across them.

**Caching (proposed — Q5): none for the series.** At 1.26 ms, computing it
costs less than reading a cache would, and a cache would add the one failure
worth avoiding: the chart disagreeing with the match list on the same page. The
series is computed from the matches that page just loaded, so the two cannot
disagree. Nothing new is written to Redis.

The provider response and the stored matches are already cached by the existing
sync (`getSeasonMatches`' Redis TTL, and the refresh interval above), and that
is unchanged.

**Would many users change this? Not by the number of users alone.** The cost is
per signed-in team-page view, and it is CPU, not I/O: at 1.26 ms, 100 such views
a second is about 13% of one core. The database read beside it already exists
and is the larger cost either way. The trigger to revisit is a measurement —
server CPU per request, or response time on the team page — not a user count.
If that trigger fires, the cache to add is one keyed on the season's newest
stored `updatedAt`, so that it can never outlive the data it was computed from
and so never disagree with the match list.

## Chart foundation

The app has never rendered a vector graphic: no charting library, no chart
component, no `<svg>` in `src/`. This feature introduces that, so the choice is
recorded in `decisions/030-league-position-by-matchday.md` rather than made
silently.

Requirements any approach must meet:

- **Rendered on the server.** The team page is a server component; the chart
  must not need client JavaScript to appear.
- **Testable under this repository's rules.** 100% coverage and a mutation check
  on every test. A test must be able to assert *what is drawn* — the points,
  the axis range, the direction — not only that a component mounted. SVG output
  is assertable in jsdom; a canvas is not.
- **Accessible.** The text alternative above, and the chart itself marked up so
  a screen reader announces what it is.
- **Theme-aware.** Colours from the site's existing tokens, correct in light and
  dark.
- **Reusable by #327–#329** without being built for them: a line, an axis, a
  text alternative. Nothing speculative beyond that.

**Recommendation (proposed — Q7):** hand-rolled SVG, no library. Only a line and
two axes are needed here, and bars and categories later; a library would bring
more than that, and most render on the client or to canvas.

## Edge Cases

Settled — these follow from existing behaviour:

- **Signed-out reader:** no chart and no data are sent; the prompt in the UX
  table is shown instead (wording: Q1). The series is not rendered hidden.
- **Team with no finished matchday in the season** (season not started, or the
  team has not yet played): the "no rounds played" message, no chart.
- **Season in progress:** the line ends at the last matchday with a finished
  match for this team. Unplayed matchdays are absent, not zero.
- **A matchday this team did not play** (a bye in an odd-sized league, or a
  match of theirs still unplayed): the team's position still changes when others
  play, so the point is plotted — it is where the table stood — **as an open
  circle**, with the legend beneath the chart and `(ei omaa ottelua)` in its text
  row (#413). A filled dot is a round in which the team played a match counted
  in that round. This matters most where TASO numbers rounds out of calendar
  order: Veikkausliiga 2026's Mestaruussarja played its first matches as rounds
  27, 31, 25, 29 and 24, so KuPS's line reached round 31 after two matches of
  its own, and only the circles show which points are its.
- **Tied positions:** the ranking function decides, exactly as on the standings
  page; the chart never breaks a tie differently.
- **Matches with `matchday === null`** count towards no round (spec 003).
- **Data cannot be read:** the error message in the UX table; the rest of the
  team page renders as it does today.

Needing a decision:

- **Competitions with no league table** — Q2.
- **Veikkausliiga's split into championship and relegation groups** — Q3.
- **A postponed match played weeks after its matchday** — Q4.

## Performance & Limits

- **football-data: zero additional provider requests and database reads.**
  **TASO: one small additional read, and at most one TASO request per active
  competition per 15 minutes**, shared by every reader — see the request budget
  under *API & Data*. Nothing is fetched per round: calling
  `getStandings({ round })` per matchday is ruled out.
- In-memory cost: `N` table computations, measured at 1.26 ms for the largest
  case (38 rounds, 20 teams, 380 matches).
- No pagination; the whole season is already in memory for the match list.
- A failing sync already falls back to stored matches (`refreshFailed`); the
  chart uses whatever the page used, so it degrades with the page rather than
  separately.

## Security & Secrets

- No new environment variables. `.env.example` is unchanged.
- The signed-in gate is enforced **on the server**: for a signed-out request the
  series is neither computed into the page nor sent to the browser. Hiding it
  with CSS or client code would publish it anyway.
- The team pages are already `force-dynamic`, so reading the session there does
  not cost a prerender (the #182 constraint applies only to `/`, `/kotimaa`,
  `/ulkomaat` and `/maajoukkueet`).

## Acceptance Criteria

Criteria that depend on an open question are written against my proposed
answer, and will be rewritten if the answer differs.

- [ ] A signed-in reader on a league team's page sees the chart for the selected
      competition and season, with one point per played matchday
- [ ] Each plotted position equals the position the standings page shows for
      that team after that round (`?kierros=N`) — checked for at least one
      football-data league and one TASO league
- [ ] A signed-out reader sees the sign-in prompt, and the page's HTML contains
      no position values
- [ ] Position 1 is drawn at the top; the y-axis spans 1 to the number of teams
- [ ] The text alternative lists every matchday and position shown on the chart
- [ ] A season with no played matchday shows the "no rounds played" message and
      no chart
- [ ] A cup, knockout or national-team page shows no chart section at all
- [ ] In a verified Veikkausliiga split season, a lower-group team's first
      post-split point is its group position plus the upper group's size — e.g.
      7th for the lower group's leader when the upper group has six teams
- [ ] In a Kakkonen split season, the line continues through the team's pool's
      split: its position within the pool, below only that pool's upper group,
      on an axis spanning the pool
- [ ] In a season without a verified carry-over, the line ends at the last
      regular-season round, with the note beneath it
- [ ] No request or read is made per round. For football-data the chart adds no
      provider request and no database read; for TASO it adds only the group-row
      read the standings page already uses, whose TASO request is limited to the
      active season and the 15-minute cache — asserted by tests that count them
- [ ] The chart renders with no client-side JavaScript
- [ ] Colours are correct in both light and dark themes

## Tests Required

- `tests/unit/lib/position-series.test.ts` — the computation: positions after
  each matchday for a small fixture season; a tie resolved exactly as
  `calculateStandings` resolves it; `matchday: null` excluded; a bye plotted;
  a season in progress ending at the last played round; an empty season.
- A test asserting chart positions equal `getStandings({ round })` positions
  for the same fixture — the property the whole feature rests on.
- Split seasons: the combined offset for a lower-group team; group order decided
  by the regular-season leader, not by group id (a fixture where the ids are in
  the opposite order); group size read from the data (a fixture with groups of
  unequal size); the line stopping at the split for an unverified season and for
  a two-parent season.
- `tests/unit/components/…` for the chart: the SVG's points, axis range and
  direction; the text alternative's rows; Finnish strings.
- Team page: signed-in shows the chart; signed-out shows the prompt and no
  values in the output.
- The request budget, counted with the provider and the database stubbed: the
  number of reads and requests does not grow with the number of rounds; for
  football-data it is the same as without the chart; for TASO the group rows
  are read once per render.
- `getStandings` is never called with a `round` from the chart's path.
- `tests/e2e/`: one signed-in team page renders the chart; one signed-out page
  shows the prompt.
- Every new test mutation-checked before review.

## Files To Update

- `specs/030-league-position-by-matchday.md` — this file.
- `decisions/030-league-position-by-matchday.md` — written during
  implementation, including the chart-foundation choice.
- `src/lib/` — the series computation (`position-series.ts`); a
  `getTeamPositionSeries` in each of `standings-service.ts` and
  `taso-standings-service.ts`, reading the season through the reads the team
  page already makes — football-data's now `cache()`d, TASO's already were —
  and reusing each provider's own table calculation rather than duplicating it;
  the sign-in gate (`analytics-access.ts`, and `e2e-analytics.ts` for the e2e
  suite's override); `src/components/` — the chart and
  its text alternative; `src/components/competition-team-page.tsx` — where it
  appears.
- No `.env.example`, `docs/setup/` or schema change.

## Decisions

Answered by Miikka on 2026-09-18.

| | Question | Answer |
|---|---|---|
| Q1 | What a signed-out reader sees | A message pointing at analytics as a whole: signed-out readers see no analytics or trends anywhere, so it should say that rather than name one chart. Wording: see A |
| Q2 | Which competitions | League competitions only |
| Q3 | Veikkausliiga after the split | The combined table; the lower group starts below the upper one — 7th for its leader when the upper group has six teams. Exact rule: see B |
| Q4 | Postponed matches | Counted at their matchday, as spec 003 does; history may redraw when a postponed match is played |
| Q5 | Caching | None, since it provides no value here. Revisit on measured CPU or response time, not user count — see *Caching* |
| Q6 | Finnish strings | As listed, with `Kaudelta` corrected to `Kaudella` |
| Q7 | Chart foundation | Hand-rolled SVG, because it is testable and renders on the server |
| D | TASO needs the season's group rows to match the standings page | Reuse the standings page's own `getSyncedGroupTeams` (option 1): one small read, and at most one TASO request per active competition per 15 minutes, shared by every reader. Found during implementation |
| Q8 | One PR or two | One feature, starting as one PR. Split into stacked PRs if the diff nears Sourcery's per-PR limit; the issue and PR are edited when that is known |
| A | The signed-out message | `Kirjaudu sisään nähdäksesi analyysit ja trendit.` |
| B | The combined position after a split | Group position plus the size of every group above; groups ranked by where their teams finished the regular season; sizes from the data |
| E | Leagues played in parallel pools (Kakkonen) | Each pool is its own league until the end of its continuation, and the axis spans the pool; the promotion playoff after it is a bracket, with no line — *"the nousukarsinnat is a bracket, no line there"*. Replaces the earlier rule that stopped the line for any season with more than one regular-season group, found in review (#412) to stop Kakkonen's line although its continuations are verified |
| C | Seasons where "combined" cannot be computed | The line stops at the end of the regular season with a note — *"not trying to magically calculate things"*. It stops wherever the standings page has no per-round table, which is mostly old seasons plus the live season's short window before its carry-over entry is verified |

## Open Questions

None. Every question above is answered.
