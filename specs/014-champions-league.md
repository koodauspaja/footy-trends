# 014 — Champions League

## Summary

Add UEFA Champions League (`CL`) to `/ulkomaat` as the first **cup-format**
competition: a league/group phase rendered as standings, a knockout phase
rendered as a match list, and a drawn bracket for the last three rounds.

## Scope

### In scope

- `CL` added to the football-data.org competition registry, marked as a **cup**
  format so pages can branch on shape rather than on the code itself.
- A `stage` and `group` column on `matches`, populated from the provider's
  `stage`/`group` fields, which today's `normalizeMatch` discards.
- `/ulkomaat/sarjataulukko?kilpailu=CL&kausi={season}` renders the phase
  standings, in whichever of the two shapes the season uses (see **API &
  Data**).
- `/ulkomaat/ottelut?kilpailu=CL&kausi={season}` gains a **stage** selector in
  place of the round selector, since a cup's `matchday` is a leg number, not a
  round.
- A **bracket** for `QUARTER_FINALS` → `SEMI_FINALS` → `FINAL`, rendered on the
  standings page below the tables, with two-legged ties resolved to a single
  aggregate result per tie.
- `/ulkomaat/joukkue/{id}?kilpailu=CL` continues to work unchanged — a team's
  match list needs no cup awareness.
- Finnish names for every stage the provider emits.

### Out of scope

- **World Cup (`WC`) and European Championship (`EC`)** — #165. They reuse
  everything built here, but belong to the new `Kansainväliset` landing region,
  which does not exist yet. Two shapes they need and this spec does not build:
  the `LAST_32` and `THIRD_PLACE` stages, and single-leg ties with a `null`
  matchday. Both appear under **Edge Cases** so they are anticipated rather
  than retrofitted.
- **Finnish cups (`MSC`, `NSC`, Ykkösliigacup)** — #164, the TASO side of the
  same idea. This spec must not add TASO code.
- **Huuhkajat (#166) and Helmarit (#167)** — national-team match lists, no
  bracket, no standings.
- **Copa Libertadores (`CLI`)** — available on our plan, deliberately excluded
  (confirmed in chat).
- A bracket for `PLAYOFFS` or `LAST_16`. They stay match lists; see **Edge
  Cases** for why.
- Changing anything about the nine existing league competitions. Their pages,
  their round selector, and their standings must be byte-identical after this
  change.
- Backfilling `stage`/`group` for existing league rows. The columns are
  nullable and league rows legitimately have no stage.

## UX / UI (Finnish strings)

### Competition picker (`/ulkomaat`)

`CL` joins the existing list as **`Mestarien liiga`**, with country
**`Eurooppa`** for the flag's alt text. Flag URL is football-data's
`area.flag` for Europe, matching how the nine leagues already source theirs.

### Stage names

One mapping, used by the stage selector, the standings headings, and the
bracket. Finnish knockout naming is by fraction, so the round of 16 is
`Neljännesvälierät`, not a transliteration of "last 16":

| Provider `stage` | Finnish |
|---|---|
| `LEAGUE_STAGE` | `Liigavaihe` |
| `GROUP_STAGE` | `Lohkovaihe` |
| `PLAYOFFS` | `Pudotuspelikarsinta` |
| `LAST_16` | `Neljännesvälierät` |
| `QUARTER_FINALS` | `Puolivälierät` |
| `SEMI_FINALS` | `Välierät` |
| `FINAL` | `Loppuottelu` |

An unmapped stage renders its raw provider value rather than an empty string,
so a format change is visible instead of silent.

### Standings page (`/ulkomaat/sarjataulukko?kilpailu=CL`)

- Heading: the existing `{competitionName} {seasonLabel}` pattern, e.g.
  `Mestarien liiga 2024/2025`.
- **2024 onward** — one `StandingsTable` under an `<h2>` reading `Liigavaihe`.
- **2023** — eight `StandingsTable`s, each under an `<h2>` reading
  `Lohko A` … `Lohko H`, derived from the provider's `GROUP_A` … `GROUP_H`,
  sorted alphabetically by group letter rather than by the provider's array
  order.
- `StandingsLegend` renders once, below the last table, as it does today.
- No `Kierros` selector on a cup page. The league phase's matchdays are real
  rounds, but mixing a round selector with a stage selector on one page is
  two controls answering the same question; the stage selector on
  `/ulkomaat/ottelut` covers it.

### Bracket

Below the standings, under an `<h2>` reading **`Pudotuspelit`**. Each tie is
one row showing both teams, the aggregate score, and the two legs' individual
results. A tie decided on penalties appends **`(rp)`**; one decided in extra
time appends **`(ja)`**.

- Not-yet-played ties render the team names with `–` in place of a score.
- A tie whose participants are not yet known renders **`Ratkeamatta`** in
  place of each unknown team name.
- Empty bracket (no knockout matches stored yet): **`Pudotuspelit eivät ole
  vielä alkaneet.`**

### Matches page (`/ulkomaat/ottelut?kilpailu=CL`)

- The `Kierros` select is replaced by a `Vaihe` select listing the season's
  stages in provider order, labelled with the Finnish names above.
- Default selection: the stage of the earliest not-yet-finished match, or the
  last stage when the season is complete — the cup analogue of
  `resolveCurrentRound`.
- The match list keeps its existing headers `Pvm`, `Ottelu`, `Tulos`. The
  fourth column shows **`Osaottelu`** (leg number) for knockout stages and
  **`Kierros`** (matchday) for the league/group phase.
- Empty stage: the existing `Otteluita ei ole saatavilla.`

## API & Data

### Endpoints (both already in use, no new provider surface)

| Endpoint | Purpose | Cache key | TTL |
|---|---|---|---|
| `GET /v4/competitions/CL` | season context | `football-data:competition:CL:v2` | 3600 s |
| `GET /v4/competitions/CL/matches?season={id}` | all matches | `football-data:matches:CL:{season}` | 900 s |

Both TTLs are the existing `COMPETITION_CACHE_TTL_SECONDS` and
`MATCHES_CACHE_TTL_SECONDS` constants. No new TTL values are introduced.

### The two season shapes (verified live, 2026-08-26)

Our plan reaches **2023, 2024 and 2025 only** — `season=2022` returns HTTP 403
("restricted … not within your permissions"), consistent with
`FOOTBALL_DATA_EARLIEST_SEASON=2023`. Those three seasons do not share a
format:

| Season | Stages | Matches |
|---|---|---|
| 2023 | `GROUP_STAGE` (`GROUP_A`…`GROUP_H`, 12 each) → `LAST_16` → `QUARTER_FINALS` → `SEMI_FINALS` → `FINAL` | 125 |
| 2024 | `LEAGUE_STAGE` (144, matchdays 1–8) → `PLAYOFFS` → `LAST_16` → `QUARTER_FINALS` → `SEMI_FINALS` → `FINAL` | 189 |
| 2025 | as 2024 | in progress |

The shape is **derived from the data**, never from a hardcoded season number:
if the season's matches contain `GROUP_STAGE`, render per-group tables; if they
contain `LEAGUE_STAGE`, render one. A season containing neither renders no
standings and only the bracket.

### New fields

`NormalizedProviderMatch` gains:

```ts
/** Provider stage, e.g. "LEAGUE_STAGE" | "LAST_16" | "FINAL". Null for
    competitions whose matches carry no stage. */
stage: string | null;
/** Provider group, e.g. "GROUP_A". Null outside a group stage — including
    every match of a LEAGUE_STAGE season. */
group: string | null;
```

`matches` gains two nullable `text` columns, `stage` and `group_name`
(`group` is reserved in SQL), six nullable `integer` columns for the score
breakdown (`regular_time_home`, `regular_time_away`, `extra_time_home`,
`extra_time_away`, `penalties_home`, `penalties_away`), and an index on
`(competition_code, season_id, stage)` since every cup read is scoped that way.
Every new column is nullable and unset for the nine existing leagues, so the
migration needs no backfill.

### Aggregate scoring — the load-bearing detail

**`score.fullTime` includes the penalty shootout.** Verified live: Liverpool
1–5 Paris Saint-Germain (`LAST_16`, 2024) has
`fullTime: {home: 1, away: 5}` but `regularTime: {home: 0, away: 1}` and
`penalties: {home: 1, away: 4}`. Six such matches exist across 2023–2024.

Therefore:

- The **tie aggregate** sums `regularTime` plus `extraTime` across both legs,
  never `fullTime`.
- `penalties` decides the tie **only** when that aggregate is level.
- `score.duration` (`REGULAR` | `EXTRA_TIME` | `PENALTY_SHOOTOUT`) drives the
  `(ja)` / `(rp)` suffix.
- The stored `homeGoals`/`awayGoals` stay `fullTime` as today — changing them
  would alter the nine league competitions' standings.
- The breakdown is **stored, not recomputed**: `NormalizedProviderMatch` and
  `matches` both gain `regularTimeHome/Away`, `extraTimeHome/Away` and
  `penaltiesHome/Away`, all nullable (a league match has none). This keeps the
  DB a complete source of truth, so the bracket still renders when the provider
  is unreachable and the DB is the fallback.

### Tie pairing

A tie is the unordered pair of team ids appearing in a stage, `matchday` 1 and
2. `FINAL` is a single match with `matchday: 0` and is its own tie.

## Edge Cases

- **Penalty shootout inflating the score** — as above. A naive `fullTime`
  aggregate reports Liverpool–PSG as 1–5 rather than 0–1 on aggregate.
- **`FINAL` has `matchday: 0`**, not 1 or null. Any leg-number rendering must
  special-case it, and `listSelectableRounds`-style code that assumes ≥ 1 must
  not be reused for stages.
- **A single-leg knockout round.** 2024's `PLAYOFFS` and every `LAST_16` tie
  are two-legged, but the format has changed twice in three seasons. A stage
  with one match per team pair must render as one result, not as a half-empty
  aggregate.
- **A tie whose two legs are split across stages** — must not happen, but if
  the provider emits an odd number of matches for a pair, render each leg as
  its own row rather than dropping one.
- **Season with no knockout matches yet** (2025 mid-league-phase) — bracket
  shows the empty-state string; standings render normally.
- **2023 requested with a group-stage-shaped renderer on a `LEAGUE_STAGE`
  season, or vice versa** — impossible by construction, since shape comes from
  the data.
- **`kausi=2022`** — already handled: outside `listSelectableSeasons`, so
  `parseSeasonParam` rejects it before any provider call. Confirm the 403 is
  never reachable.
- **`vaihe=` with an unknown value** — same treatment as today's invalid
  `kierros`: show the whole season and the existing notice pattern.
- **A team appearing in both the league phase and the knockout phase** — normal;
  the standings table covers only league/group-phase matches, so knockout
  results must not leak into it.
- **Nine existing leagues** — `stage` is null for all their matches, and the
  standings path must be unchanged for them.

## Performance & Limits

- football-data.org free/basic plan: 10 requests/minute. This feature adds no
  new call — the two existing endpoints already return the full season.
- The largest response is 189 matches (2024), well under the existing league
  volumes (380 for a 20-team league), so no pagination is needed.
- Bracket computation is O(n) over at most 29 knockout matches; no caching
  beyond the existing match cache.
- The 2023 page renders 8 tables of 4 rows plus a bracket — smaller than a
  20-row league table.

## Security & Secrets

- No new environment variables. `FOOTBALL_DATA_API_KEY` and
  `FOOTBALL_DATA_EARLIEST_SEASON` already exist in `.env.example`.
- `kilpailu` and the new `vaihe` parameter are validated against a fixed
  allowlist before reaching a provider URL, a cache key, or a query — the same
  rule `parseCompetitionParam` and `parseSeasonParam` already enforce.
- No secrets committed; the API key stays server-side, as today.

## Acceptance Criteria

- [ ] `/ulkomaat` lists `Mestarien liiga` alongside the nine leagues.
- [ ] `/ulkomaat/sarjataulukko?kilpailu=CL&kausi=2024` renders **one** table
      headed `Liigavaihe` with 36 teams.
- [ ] `/ulkomaat/sarjataulukko?kilpailu=CL&kausi=2023` renders **eight** tables
      headed `Lohko A` … `Lohko H`, four teams each.
- [ ] The season selector for `CL` offers exactly 2023, 2024, 2025.
- [ ] `/ulkomaat/ottelut?kilpailu=CL` shows a `Vaihe` selector, not `Kierros`.
- [ ] The bracket shows Puolivälierät, Välierät and Loppuottelu for 2024, with
      PSG as the 2024 winner.
- [ ] The 2024 `LAST_16` tie Liverpool–Paris Saint-Germain reports an aggregate
      of **1–1** with PSG advancing on penalties (`rp`), **not** 1–5.
- [ ] `/ulkomaat/sarjataulukko?kilpailu=PL` is visually and numerically
      unchanged from before this feature.
- [ ] `kausi=2022` for `CL` is rejected by the season parser without a provider
      call.
- [ ] Every user-facing string added is Finnish.

## Tests Required

- `tests/unit/lib/football-data.test.ts`
  - `normalizeMatch` carries `stage` and `group`; both null when absent.
  - A `PENALTY_SHOOTOUT` match keeps `fullTime` in `homeGoals`/`awayGoals`.
- `tests/unit/lib/cup-bracket.test.ts` (new)
  - Two legs pair into one tie, aggregate summed from `regularTime` + `extraTime`.
  - Liverpool–PSG fixture → aggregate 1–1, winner PSG, suffix `rp`.
  - Extra-time tie → suffix `ja`, winner from aggregate.
  - Single-leg stage → one row, no aggregate label.
  - Odd number of matches for a pair → each leg its own row, none dropped.
  - `FINAL` with `matchday: 0` → its own tie.
- `tests/unit/lib/cup-stages.test.ts` (new)
  - Stage → Finnish name mapping, including the unmapped-stage passthrough.
  - Shape detection: `GROUP_STAGE` present → grouped; `LEAGUE_STAGE` present →
    single; neither → none.
  - `parseStageParam` rejects an unknown value.
- `tests/unit/lib/competitions.test.ts`
  - `CL` is present and marked as a cup; the nine leagues are unchanged and
    still marked as leagues.
- `tests/integration/` — standings for `CL` 2023 produce eight groups and for
  2024 a single 36-row table, against fixture data, not the live API.
- `tests/e2e/` — `/ulkomaat/sarjataulukko?kilpailu=CL&kausi=2024` shows one
  `Liigavaihe` table and a `Pudotuspelit` heading; `kausi=2023` shows eight
  `Lohko` headings.

## Files To Update

- `specs/014-champions-league.md` — this file.
- `src/lib/competitions.ts` — `CL` entry, `format` discriminator.
- `src/lib/cup-stages.ts` (new) — stage names, shape detection, `parseStageParam`.
- `src/lib/cup-bracket.ts` (new) — tie pairing and aggregate resolution.
- `src/lib/football-data.ts` — carry `stage`, `group`, and the score breakdown.
- `src/db/schema.ts` + `drizzle/` migration — `stage`, `group_name`, index.
- `src/lib/standings-service.ts` — stage-scoped reads, group-phase standings.
- `src/app/foreign/standings/page.tsx`, `src/app/foreign/matches/page.tsx`.
- `src/components/` — bracket component; stage select alongside `round-select`.
- `decisions/014-champions-league.md` — written by the implementing agent.
- `.env.example` — **no change**; noted here so the reviewer knows it was checked.

## Open Questions

None outstanding. The three raised during spec review were resolved in chat on
2026-08-26 and are recorded above rather than left here:

1. **Bracket score source — resolved: store the breakdown.** `matches` gains
   `regular_time_home/away`, `extra_time_home/away` and `penalties_home/away`
   alongside `stage` and `group_name`, so the DB remains a complete source of
   truth and the bracket still renders when the provider is unreachable and
   the DB is serving as fallback. The alternative — computing the bracket from
   the cached provider response — was rejected because it would blank the
   bracket while the standings beside it still rendered.
2. **Group table ordering — resolved: alphabetical by group letter.** Not the
   provider's array order. The two coincide today; sorting explicitly keeps the
   page deterministic if the API ever reorders.
3. **`PLAYOFFS` naming — resolved: `Pudotuspelikarsinta`.**
