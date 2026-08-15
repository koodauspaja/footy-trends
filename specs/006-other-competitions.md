# 006 — Other competitions

## Summary
Expand beyond Premier League to the other 8 plain league-table competitions
our football-data.org plan already grants access to, so a user can browse
standings, a team's matches, and the season-wide match list for any of them
— not just Premier League.

## Scope

### In scope
- Add the 8 other **league-format** competitions confirmed available on our
  plan (verified live against `/v4/competitions`): Championship (`ELC`),
  Ligue 1 (`FL1`), Bundesliga (`BL1`), Serie A (`SA`), Eredivisie (`DED`),
  Primeira Liga (`PPL`), Primera Division (`PD`), Campeonato Brasileiro
  Série A (`BSA`) — joining the existing Premier League (`PL`). 9 total.
- A `?kilpailu=<code>` query param, added to all three existing pages, to
  select which competition is being viewed. Defaults to `PL` when absent,
  matching today's implicit behavior.
- `/` becomes a **competition picker**: a plain list of all 9 competitions,
  each linking to the standings page for that competition. It no longer
  shows standings itself.
- A new page at the public URL `/sarjataulukko` (folder `src/app/standings`,
  English per project convention, connected via a `next.config.ts` rewrite —
  same pattern as `/joukkue/:id` and `/ottelut`) hosting exactly what `/`
  used to do: standings + `Kausi`/`Kierros` selectors, now also aware of
  `kilpailu`.
- `/joukkue/:id` and `/ottelut` gain `kilpailu` awareness (read from the
  query param, validated, defaulted to `PL`) but **no new competition
  selector UI on those two pages** — competition is carried through links
  from the standings page, not switched mid-view. See Open Questions.
- Every provider/service function that currently hardcodes `"PL"` becomes
  parameterized by `competitionCode`: `getSeasonContext`, `getSeasonMatches`,
  `getPremierLeagueStandings` (renamed — no longer PL-specific),
  `getTeamMatches`, `getRoundMatches`, `getMaxMatchday`, `synchronizeMatches`,
  and every Redis cache key that already interpolates a competition code
  string.
- New `src/lib/competitions.ts`: the supported competition list (code +
  display name) and a `parseCompetitionParam` validator, mirroring the
  existing `parseSeasonParam`/`parseRoundParam` pattern.
- Each competition's **national flag** (from the provider's `area.flag`
  field, e.g. `https://crests.football-data.org/770.svg` for England) shown
  next to its name on the picker page and in the `Kilpailu` selector.
  Deliberately flags, not club/league crests — football-data.org's own
  terms require separate consent from the clubs/leagues to use their
  logos, which we don't have; national flags are a different, much less
  restrictive category and sidestep that question entirely.

### Out of scope
- The 4 cup/knockout competitions our plan also grants (Champions League,
  European Championship, Copa Libertadores, World Cup) — no simple
  round-robin table, needs different data modeling. Tracked separately as
  #68.
- Finnish leagues (Veikkausliiga etc.) — different, non-football-data.org
  provider entirely. Tracked separately as #88.
- A per-competition earliest-selectable-season override — verified live
  that the `2023` floor is identical across all 9 competitions (2022 and
  earlier all return `403` for every one of them), so
  `FOOTBALL_DATA_EARLIEST_SEASON` stays a single global env var.
- A nightly resync/backfill job across all 9 competitions — a separate,
  future consideration (see notes on #71/#85), not part of this feature.
- Cross-competition features (comparing a team across competitions, a
  global search) — not requested.
- Preserving old bookmarked `/?kausi=2025`-style URLs — see Edge Cases.

## UX / UI (Finnish strings)

**Home page `/` (new — the picker)**:
- Heading: `"Valitse kilpailu"`.
- A plain list of all 9 competitions, each a link to
  `/sarjataulukko?kilpailu={code}`, labeled with the competition's display
  name (see Competition names below) and its national flag (`area.flag`,
  an `<img>` with the country name as `alt` text — e.g. `alt="Englanti"`
  — not the competition name, since the flag represents the country, not
  the league).

**`/sarjataulukko` (was `/`)**:
- Heading: `"{competition name} {seasonLabel}"`, e.g. `"Bundesliga
  2026/27"`, `"Serie A 2025/26"`. Confirmed: this changes Premier League's
  existing heading text from `"Valioliigan sarjataulukko {seasonLabel}"` to
  `"Valioliiga {seasonLabel}"`, for consistency with the other 8 — the
  route itself (`/sarjataulukko`, and the picker page linking here) already
  conveys "this is a standings table," so repeating "sarjataulukko" in
  every heading would be redundant once there are 9 of them.
- New `Kilpailu` selector alongside the existing `Kausi`/`Kierros` ones,
  labeled `"Kilpailu"`, each option showing the competition's flag next to
  its name (same as the picker).
- Existing fallback banners (`"Kautta ei löytynyt..."`,
  `"Kierrosta ei löytynyt..."`) unchanged. New one for competition:
  `"Kilpailua ei löytynyt. Näytetään {default competition name}."` (default
  = Premier League / `"Valioliiga"`).

**`/joukkue/:id` and `/ottelut`**: no new selector UI. Both read `kilpailu`
from the query string (defaulting to `PL`, validated the same way as
`kausi`), and every internal link they already build (team links, round
nav, the season/round `<select>` forms) carries `kilpailu` forward so
competition context isn't lost when paginating within a page.

**Competition names** — per your correction: use each competition's own
native/official name as football-data.org itself provides it, no invented
translations, a qualifier only where two names would actually collide (or,
for `PD`, where the provider's own name is less recognizable than the
competition's common brand name). Flag URLs verified live against
`/v4/competitions`' `area.flag` field:

| Code | Display name | Flag (`area.flag`) |
|------|-------------|---------------------|
| `PL` | `Valioliiga` *(existing, unchanged)* | `crests.football-data.org/770.svg` (England) |
| `ELC` | `Championship` | `crests.football-data.org/770.svg` (England) |
| `FL1` | `Ligue 1` | `crests.football-data.org/773.svg` (France) |
| `BL1` | `Bundesliga` | `crests.football-data.org/759.svg` (Germany) |
| `SA` | `Serie A` | `crests.football-data.org/784.svg` (Italy) |
| `DED` | `Eredivisie` | `crests.football-data.org/8601.svg` (Netherlands) |
| `PPL` | `Primeira Liga` | `crests.football-data.org/765.svg` (Portugal) |
| `PD` | `Primera Division (LaLiga)` | `crests.football-data.org/760.svg` (Spain) |
| `BSA` | `Campeonato Brasileiro Série A` | `crests.football-data.org/764.svg` (Brazil) |

## API & Data

**New `src/lib/competitions.ts`**:
```ts
export const DEFAULT_COMPETITION_CODE = "PL";
export const SUPPORTED_COMPETITIONS: { code: string; name: string; flagUrl: string }[] = [
  { code: "PL", name: "Valioliiga", flagUrl: "https://crests.football-data.org/770.svg" },
  { code: "ELC", name: "Championship", flagUrl: "https://crests.football-data.org/770.svg" },
  { code: "FL1", name: "Ligue 1", flagUrl: "https://crests.football-data.org/773.svg" },
  { code: "BL1", name: "Bundesliga", flagUrl: "https://crests.football-data.org/759.svg" },
  { code: "SA", name: "Serie A", flagUrl: "https://crests.football-data.org/784.svg" },
  { code: "DED", name: "Eredivisie", flagUrl: "https://crests.football-data.org/8601.svg" },
  { code: "PPL", name: "Primeira Liga", flagUrl: "https://crests.football-data.org/765.svg" },
  { code: "PD", name: "Primera Division (LaLiga)", flagUrl: "https://crests.football-data.org/760.svg" },
  { code: "BSA", name: "Campeonato Brasileiro Série A", flagUrl: "https://crests.football-data.org/764.svg" },
];
export type CompetitionParamResult =
  | { kind: "absent" }
  | { kind: "valid"; code: string }
  | { kind: "invalid" };
export function parseCompetitionParam(
  rawValue: string | string[] | undefined
): CompetitionParamResult { /* same shape as parseSeasonParam, no async data needed — the list is static */ }
```

Flags are hardcoded (not fetched per-page) since the picker must show all 9
without triggering 9 API calls just to render a landing page — flags
essentially never change, unlike season/standings data, so this is a
reasonable static config rather than something to sync.

**`src/lib/football-data.ts`**:
- `getSeasonContext(competitionCode: string)` — cache key
  `football-data:competition:${competitionCode}:v2`, request path
  `/competitions/${competitionCode}`.
- `getSeasonMatches(competitionCode: string, seasonId: number)` — cache key
  `football-data:matches:${competitionCode}:${seasonId}`, request path
  `/competitions/${competitionCode}/matches?season=${seasonId}`.
- `normalizeMatch` already returns `competitionCode: string` per match
  (currently hardcoded to `"PL"` inside the function) — becomes a parameter
  passed through instead.

**`src/lib/standings-service.ts`**:
- Every exported function gains a leading (or matching existing positional
  convention) `competitionCode: string` parameter:
  `getPremierLeagueStandings` → renamed `getStandings`, `getTeamMatches`,
  `getRoundMatches`, `getMaxMatchday`, `synchronizeMatches`.
- `COMPETITION_CODE` module constant removed; every place it was used
  becomes the parameter.
- Cache keys `standings:${competitionCode}:${seasonId}`.
- DB queries already filter on `matches.competitionCode` — no schema
  change, the column already exists from the original schema
  (`decisions/001-premier-league-match-based-standings.md`).

**Routes**:
- `src/app/page.tsx` — replaced with the picker (no data fetching beyond
  the static `SUPPORTED_COMPETITIONS` list).
- `src/app/standings/page.tsx` (new, moved from the old `src/app/page.tsx`)
  — adds `parseCompetitionParam`, threads `competitionCode` through every
  service call, renders the `Kilpailu` selector.
- `src/app/team/[id]/page.tsx`, `src/app/matches/page.tsx` — add
  `parseCompetitionParam` (default `PL` on absent, banner + default on
  invalid), thread `competitionCode` through their service calls and
  outgoing links.
- `next.config.ts` — add `{ source: "/sarjataulukko", destination:
  "/standings" }`.

## Edge Cases
- `kilpailu` absent anywhere → defaults to `PL`, no banner (matches
  today's implicit default).
- `kilpailu` present but not one of the 9 supported codes → banner, falls
  back to `PL`, mirroring the `kausi`/`kierros` invalid pattern exactly.
- A competition whose current season hasn't started yet (e.g. Bundesliga's
  2026/27, confirmed live right now) — the existing upcoming-season
  widening logic (spec 005) is already generic per competition; verified
  the API response shape (`currentSeason`/`seasons`) is identical to PL's.
  No new code needed, just confirmed it isn't PL-specific already.
- Competitions have different team/round counts (e.g. Bundesliga: 18 teams,
  34 rounds vs. Premier League's 20/38) — `listSelectableRounds`/
  `getMaxMatchday` already derive this from stored data per season, nothing
  hardcodes 38.
- **Old bookmarked URLs**: `/?kausi=2025` no longer shows standings (`/` is
  now the picker, and ignores `kausi`/`kierros` entirely). This is a
  deliberate breaking change, not a redirect — acceptable for a
  pre-production app, but worth being explicit that it's intentional, not
  an oversight.
- A competition's matches/standings are fetched and cached lazily on first
  visit, exactly like Premier League today — no proactive backfill of all
  9 competitions as part of this feature (that's the separate nightly-cron
  idea noted on #71/#85).

## Performance & Limits
- No new rate-limit exposure for normal browsing: each competition syncs
  lazily on first visit, same one-call-per-season pattern already in place
  for Premier League. Visiting a new competition for the first time costs
  the same as visiting PL cold today.
- Verified live: `x-requests-available-minute` was `9` at the time of this
  spec — comfortably enough for interactive browsing across competitions,
  but the existing `needsRefresh`/cache-TTL logic already protects against
  redundant calls regardless of how many competitions are added.

## Security & Secrets
- No new environment variables. Same `FOOTBALL_DATA_API_KEY`, same trust
  boundary.

## Acceptance Criteria
- [ ] `/` lists all 9 supported competitions, each linking to
      `/sarjataulukko?kilpailu={code}`, with the competition's national
      flag shown next to its name.
- [ ] The `Kilpailu` selector on `/sarjataulukko` shows the same flags as
      the picker.
- [ ] `/sarjataulukko?kilpailu={code}` shows that competition's standings,
      `Kausi`, and `Kierros` selectors, defaulting to `PL` when `kilpailu`
      is absent.
- [ ] An invalid `kilpailu` on any of the three pages falls back to `PL`
      with the `"Kilpailua ei löytynyt. Näytetään Valioliiga."` banner.
- [ ] `/joukkue/:id` and `/ottelut` respect `kilpailu` from the URL
      (defaulting to `PL`), and every link they generate (team links,
      round nav, season/round form submissions) preserves it.
- [ ] Selecting a competition whose current season hasn't started yet
      (e.g. Bundesliga right now) shows the standings empty state on
      `/sarjataulukko` and round 1 with all-unplayed matches on `/ottelut`
      — same behavior as Premier League's upcoming-season handling
      (spec 005), now confirmed generic across competitions.
- [ ] A never-synced competition+season still triggers the same sync path
      as Premier League does today, not just a read.
- [ ] `calculateStandings` still never receives a non-`FINISHED` match,
      for every competition (regression check, same as spec 004's).
- [ ] `npm run test:unit` and `npm run test:integration` pass with no drop
      in coverage.

## Tests Required
- `tests/unit/lib/competitions.test.ts` (new): `parseCompetitionParam` —
  absent, valid, invalid, and the full `SUPPORTED_COMPETITIONS` list shape.
- `tests/unit/lib/football-data.test.ts`: `getSeasonContext`/
  `getSeasonMatches` now take a `competitionCode` argument — update cache
  key assertions, add a case for a non-`PL` code.
- `tests/unit/lib/standings-service.test.ts`: every function's tests
  updated for the new `competitionCode` parameter; cache key assertions
  updated; add a case proving two different competitions' cached data
  don't collide.
- `tests/unit/app/page.test.tsx`: rewritten for the picker — lists all 9
  competitions with correct links.
- `tests/unit/app/standings/page.test.tsx` (new, moved/adapted from the
  old home page tests): all existing home-page test cases plus `kilpailu`
  handling (absent/valid/invalid, banner, selector).
- `tests/unit/app/team/[id]/page.test.tsx`,
  `tests/unit/app/matches/page.test.tsx`: add `kilpailu` param handling
  cases (default, valid, invalid) and confirm outgoing links preserve it.
- `tests/integration/standings.test.ts`: extend to cover two different
  competitions' data coexisting in storage without cross-contamination.

## Files To Update
- `src/lib/competitions.ts` (new)
- `src/lib/football-data.ts`, `src/lib/standings-service.ts`
- `src/app/page.tsx` (replaced — picker)
- `src/app/standings/page.tsx` (new — moved from the old home page)
- `src/app/team/[id]/page.tsx`, `src/app/matches/page.tsx`
- `src/components/` — `Kilpailu` selector piece (reusing the
  `SeasonSelect`-style presentational pattern), and updates to
  `MatchesControls`/`TeamSeasonSelector`/season-round selector to carry
  `kilpailu` through their form/link targets
- `next.config.ts` — add the `/sarjataulukko` rewrite
- Tests listed above
- `specs/006-other-competitions.md` (this file)

## Open Questions
None — all resolved in chat before implementation:
- Premier League's heading text change (`"Valioliigan sarjataulukko
  {seasonLabel}"` → `"Valioliiga {seasonLabel}"`) — confirmed acceptable.
- `PD`'s display name — confirmed as `"Primera Division (LaLiga)"`.
- Team/match pages stay scoped to one competition at a time, no merged
  cross-competition view (e.g. a team's Champions League matches never
  appear on its Premier League page) — confirmed. Related to, but not
  solved by, the relegation/promotion case tracked separately as #87
  (a team's matches split across competitions between seasons, e.g. `PL`
  one year and `ELC` the next, are separate `kilpailu` navigations with no
  cross-link between them yet).
- National flags (not club/league crests) on the picker and `Kilpailu`
  selector — confirmed, added to Scope/UX/API & Data above.
