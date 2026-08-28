# 002 — Season selector and backfill

> **Routes and names moved by `specs/012-finnish-urls-english-code.md`
> (#142).** The football-data.org pages are now under `/ulkomaat/` —
> `/ulkomaat/sarjataulukko`, `/ulkomaat/ottelut`, `/ulkomaat/joukkue/:id`
> — and the old top-level paths redirect there permanently. English paths
> such as `/standings` no longer serve a page; they redirect to their
> Finnish equivalent. In code, `kotimaa`/`ulkomaat` are now
> `domestic`/`foreign`. Paths named below refer to the pre-012 structure.


## Summary
Let the user choose which Premier League season the standings table shows, and
backfill that season's finished matches into PostgreSQL the first time it is
requested, so the application accumulates the multi-season history that later
trend features depend on.

## Scope

### In scope
- A season dropdown on the home page, driven by the `kausi` query parameter.
- Resolve the list of selectable seasons from the provider's competition
  metadata, bounded by a configurable earliest season.
- Generalize the standings read path from "the active season" to "any
  selectable season".
- Backfill a season's finished matches on first request (lazy, on demand).
- Treat completed past seasons as immutable: once stored, never re-fetch them.
- Add a composite index on `(competition_code, season_id)` to the `matches`
  table.
- Include the selected season in the page heading.

### Out of scope
- Other competitions, and any competition selector.
- Seasons that have not started yet, including 2026; the selector excludes
  them and no fixture data is stored.
- Storing non-finished matches. The `matches` table keeps its non-nullable
  goal columns and gains no `status` column in this slice.
- A standalone backfill script, cron job, or admin route.
- Match lists, team pages, match detail pages, and head-to-head views.
- A `teams` table or any team normalization.
- Page `<title>` / metadata changes.
- User accounts, personalization, and live match updates.

## UX / UI (Finnish strings)
All strings below appear on the home page (`src/app/page.tsx`) unless stated
otherwise.

- The heading becomes `Valioliigan sarjataulukko` followed by the season label,
  for example `Valioliigan sarjataulukko 2024/25`. This replaces the fixed
  heading defined in spec 001.
- The season control is a `<select>` with a visible `<label>` reading `Kausi`.
  The label must be associated with the select via `htmlFor` / `id`.
- Option text uses the season label format: start year, a slash, and the last
  two digits of the following year, zero-padded. `2024` renders as `2024/25`
  and `1999` renders as `1999/00`.
- Options are ordered newest season first.
- The control lives in `src/components/season-selector.tsx` and must work
  without client-side JavaScript. It is a `<form method="get" action="/">`
  wrapping the select; a submit button reading `Näytä` is rendered inside
  `<noscript>`. With JavaScript available, changing the select navigates
  immediately and the submit button stays hidden.
- When the `kausi` parameter names a season that cannot be selected, the active
  season is shown and a notice appears above the selector reading
  `Kautta ei löytynyt. Näytetään kausi 2025/26.`, where the label is the active
  season. The notice is exposed as `role="status"` and is absent for a valid
  season.
- While data is loading, show `Ladataan...`. *(Was `Ladataan sarjataulukkoa...`
  until #179 — see specs/001.)*
- If the selected season has no finished matches, show
  `Sarjataulukkoa ei ole saatavilla.` (unchanged).
- If the provider, database, and cache all fail with no usable stored data,
  show `Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.`
  (unchanged).
- The abbreviation legend and all table column labels are unchanged from spec
  001.
- The season selector remains visible in the empty and error states, so the
  user can switch to a season that does have data.

## API & Data

### Provider endpoints
Both endpoints are already in use from spec 001; neither is new.

1. `GET /v4/competitions/PL`
   - Cached for 1 hour under `football-data:competition:PL:v2`.
   - Supplies `currentSeason` and the `seasons[]` array.
2. `GET /v4/competitions/PL/matches?season={startYear}&status=FINISHED`
   - Cached for 15 minutes under `football-data:matches:PL:{seasonId}`; the key
     is already per-season and needs no change.

### Verified provider behaviour
Checked against the live API with the project key on 2026-08-08:

- `seasons[]` lists 130+ seasons back to `1888`, regardless of what the API
  plan actually grants.
- Seasons inside the plan return `200`; seasons outside it return `403`.
- `2023`, `2024`, and `2025` each returned `200` with 380 finished matches.
  `2022` and every earlier season returned `403`.
- `currentSeason` is `2026` with `startDate` `2026-08-21`, which has not passed;
  `selectActiveSeason` therefore resolves the active season to `2025`.

Because `seasons[]` advertises seasons the plan cannot fetch, the selector must
be bounded by configuration rather than by the provider's list.

### Selectable seasons
```
activeSeasonId = start year of selectActiveSeason(competition, now)   // existing logic
earliestSeason = FOOTBALL_DATA_EARLIEST_SEASON, default 2023
selectable     = every year from activeSeasonId down to earliestSeason
```

Seasons whose `startDate` has not passed are already excluded by
`selectActiveSeason`, so the not-yet-started 2026 season never appears.

### Stored data
No column changes. The `matches` table already stores `seasonId` as the season
start year, so a backfilled season is written by the existing normalization
path.

Add index `matches_competition_season_idx` on
`(competition_code, season_id)` and generate the corresponding Drizzle
migration. Standings queries filter on exactly this pair.

Upserting the matches from one provider response must happen inside a single
database transaction, so a failure part-way through never leaves a season
partially stored. This is what makes the immutability rule below safe.

### Read and refresh flow
For a resolved `seasonId`:

1. Return the standings from Redis when `standings:PL:{seasonId}` is present.
2. Otherwise read stored finished matches for `PL` and `seasonId` from
   PostgreSQL.
3. Decide whether a provider refresh is needed:
   - **Past season** (`seasonId < activeSeasonId`): a completed season's results
     never change. If at least one stored match exists, calculate from stored
     data and never call the provider, regardless of how old the rows are. The
     `FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS` threshold does not apply.
   - **Active season** (`seasonId === activeSeasonId`): apply the existing
     `FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS` freshness threshold, default
     3600 seconds, exactly as specified in spec 001.
4. When a refresh is needed, fetch the season's finished matches, upsert them
   transactionally, calculate the standings, and populate Redis.

### Request handling
- No `kausi` parameter: use the active season. This is the canonical URL; do
  not add the parameter.
- `kausi` present and valid: use that season.
- `kausi` absent from the selectable list, non-numeric, or otherwise
  unparseable: show the active season and state the substitution with the
  notice above. Do not pass an unvalidated value to the provider, and do not
  substitute silently.

An HTTP redirect was rejected here. The selectable-season list must be awaited
before the range check is possible, and `src/app/loading.tsx` makes Next flush
the streaming shell before that await resolves, so `redirect()` degrades to a
`<meta http-equiv="refresh" content="1;url=/">` with a one-second blank page.
Verified in both `next dev` and a production build. Stating the fallback in the
page is honest and costs no delay.

## Edge Cases
- `?kausi=abc`, `?kausi=`, or a repeated parameter: show the active season with
  the fallback notice.
- `?kausi=1999`, below the configured floor: same fallback notice.
- `?kausi=2026`, a season that has not started: same fallback notice.
- `?kausi=2024` on a cold cache and empty database: one provider request,
  matches upserted, standings rendered.
- Requesting the same past season again: served from Redis or PostgreSQL with
  zero provider requests, and no duplicate rows.
- A past season already stored, with rows older than the refresh threshold: no
  provider request is made, because past seasons are immutable.
- The provider returns `403` for a season that passed validation, for example
  after an API plan downgrade: treat it as a refresh failure. Show standings
  from stored data if any exist, otherwise the Finnish error string, and log
  the failure.
- The provider fails part-way through a backfill: the transaction rolls back,
  nothing is stored for that season, the error string is shown, and the next
  request retries cleanly.
- The provider returns an empty match list for a valid season: show
  `Sarjataulukkoa ei ole saatavilla.`
- `FOOTBALL_DATA_EARLIEST_SEASON` is missing, non-numeric, or not a positive
  integer: fall back to the 2023 default rather than throwing.
- `FOOTBALL_DATA_EARLIEST_SEASON` is later than the active season: the selector
  offers only the active season.
- JavaScript is disabled: submitting the form with `Näytä` still switches
  season.
- A team has fewer than five finished matches in the selected season: form
  shows all available results, unchanged from spec 001.
- Standings ties within any season use the deterministic team-name tie-breaker
  from spec 001.

## Performance & Limits
- Respect the provider limit of 10 requests per minute.
- A cold season costs at most two provider requests: competition metadata,
  usually already cached, plus one matches request. Never one request per team,
  match, or matchday.
- After the first backfill, a past season costs zero provider requests
  indefinitely.
- Rendering the selector must not trigger a provider request per option; the
  selectable list is derived from the already-cached competition metadata.
- Expected data volume is three seasons of 380 matches, about 1140 rows. No
  pagination is required, and the new composite index keeps the per-season
  query from scanning the whole table as seasons accumulate.
- Switching seasons must not invalidate another season's cached standings.

## Security & Secrets
- `FOOTBALL_DATA_API_KEY` is read on the server only and is never sent to the
  browser. The season selector is a client component and must not receive it.
- New variable `FOOTBALL_DATA_EARLIEST_SEASON`, default `2023`. It is not a
  secret and belongs in `.env.example` with its default value.
- The `kausi` parameter is validated against the selectable-season allow-list
  before use. An unvalidated value must never be interpolated into a provider
  URL, a cache key, or a database query.
- Provider status codes, request headers, and error details must not appear in
  user-facing output.
- `.env.example` is currently emptied in the working tree. It must be restored
  with variable names and non-secret defaults, then extended with the new
  variable. Do not commit real keys or a local `.env`.

## Acceptance Criteria
- [ ] The home page shows a `Kausi` dropdown listing selectable seasons newest
      first, labelled in `2024/25` format.
- [ ] The heading shows the selected season, for example
      `Valioliigan sarjataulukko 2024/25`.
- [ ] Selecting a season navigates to `/?kausi=<startYear>` and renders that
      season's standings.
- [ ] Switching seasons works with JavaScript disabled via the `Näytä` submit
      button.
- [ ] With no `kausi` parameter, the active season is shown and no notice
      appears.
- [ ] Non-numeric, out-of-range, and not-yet-started `kausi` values show the
      active season with the Finnish fallback notice and never reach the
      provider.
- [ ] The selectable list is bounded by `FOOTBALL_DATA_EARLIEST_SEASON`,
      defaulting to 2023, and never offers a season the provider's `seasons[]`
      advertises but the API plan rejects.
- [ ] Requesting a season with no stored matches backfills it from the provider
      and persists the finished matches to PostgreSQL.
- [ ] A backfill that fails part-way stores nothing for that season.
- [ ] A past season with stored matches never triggers a provider request, even
      when its rows are older than the refresh threshold.
- [ ] The active season still honours
      `FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS`.
- [ ] Re-requesting an already-backfilled season creates no duplicate rows.
- [ ] Standings for different seasons are cached under separate Redis keys and
      do not evict one another.
- [ ] The `matches` table has an index on `(competition_code, season_id)` with
      a generated Drizzle migration.
- [ ] The season selector stays visible in the empty and error states.
- [ ] All new user-facing strings are Finnish and match this spec exactly.
- [ ] `npm run typecheck`, `npm run lint`, and `npm test` pass.

## Tests Required

- `tests/unit/lib/seasons.test.ts` (new)
  - `formatSeasonLabel(2024)` returns `2024/25`
  - `formatSeasonLabel(1999)` returns `1999/00`
  - selectable seasons run from the active season down to the floor, newest
    first
  - a floor later than the active season yields only the active season
  - a missing, non-numeric, or non-positive floor falls back to 2023
  - parsing `kausi` accepts a valid season and rejects non-numeric, empty, and
    out-of-range values

- `tests/unit/lib/football-data.test.ts` (extend)
  - the matches cache key is per season, so two seasons do not share an entry
  - `selectActiveSeason` still resolves to the previous season when the current
    season's `startDate` has not passed

- `tests/unit/lib/standings-service.test.ts` (new)
  - a past season with stored matches calculates from storage and makes no
    provider call, even when rows are older than the refresh threshold
  - the active season still refreshes once the threshold has elapsed
  - a provider `403` for a validated season falls back to stored data, and to
    the error status when no stored data exists

- `tests/integration/standings.test.ts` (extend)
  - backfilling a past season persists its matches and calculates the expected
    standings
  - re-requesting that season makes no provider call and creates no duplicates
  - a provider failure part-way through a backfill leaves no rows for that
    season

- `tests/unit/components/season-selector.test.tsx` (new)
  - options render newest first with `2024/25` labels
  - the option matching the current season is selected
  - changing the select navigates to `/?kausi=<startYear>`
  - the `Näytä` submit button is present inside `<noscript>`
  - the select is associated with its `Kausi` label

- `tests/unit/app/page.test.tsx` (extend)
  - the heading includes the selected season label
  - the selector renders alongside the table
  - the selector is still rendered in the empty and error states
  - an unselectable or non-numeric `kausi` renders the active season with the
    fallback notice, and a valid `kausi` renders no notice
  - a failure to resolve the selectable seasons renders the error message
    without the selector

## Files To Update
- `specs/002-season-selector-and-backfill.md`
- `src/lib/seasons.ts` (new — pure season list, label, and parameter parsing)
- `src/lib/football-data.ts` (expose the active season and the season list)
- `src/lib/standings-service.ts` (accept a season, apply the immutability rule,
  transactional upsert)
- `src/components/season-selector.tsx` (new)
- `src/app/page.tsx` (read `searchParams`, validate, render the selector)
- `src/db/schema.ts` and a generated Drizzle migration for the new index
- `tests/unit/lib/`, `tests/unit/components/`, `tests/unit/app/`, and
  `tests/integration/`
- `.env.example` — restore the emptied file and add
  `FOOTBALL_DATA_EARLIEST_SEASON=2023`
- `README.md` or `docs/setup/` if the new variable needs setup notes
- `decisions/002-season-selector-and-backfill.md` during implementation

## Open Questions
- None. The selector is a dropdown using the `kausi` query parameter, backfill
  is lazy and on demand, the season range is bounded by
  `FOOTBALL_DATA_EARLIEST_SEASON` defaulting to 2023, past seasons are
  immutable once stored, and an invalid season parameter falls back to the
  active season with a stated notice rather than an HTTP redirect.
