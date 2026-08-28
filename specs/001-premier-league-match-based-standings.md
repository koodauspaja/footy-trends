# 001 — Premier League match-based standings

## Summary
Show the current Premier League standings calculated from stored match results,
so the application can later support additional competitions and match-based
analysis without depending on the provider's precomputed standings endpoint.

## Scope

### In scope
- Fetch the current Premier League season from football-data.org using
  competition code `PL`.
- Fetch finished matches for that season and upsert normalized match data into
  PostgreSQL.
- Calculate the standings in application code from finished match results.
- Show a Premier League standings table on the home page.
- Show each team's result form for its five most recent finished matches.
- Use the existing issue #1 standings columns: position, team, played, won,
  drawn, lost, goals for, goals against, goal difference, and points.
- Keep the first UI fixed to Premier League; no competition selector is needed
  in this slice.

### Out of scope
- Other competitions or a competition selector.
- Historical season selection.
- Per-match detail pages or match filtering.
- User accounts, personalization, and live match updates.
- Using the football-data.org standings endpoint as the source of truth.
- New test frameworks or browser automation.

## UX / UI (Finnish strings)
- The home page heading is `Valioliigan sarjataulukko`.
- The table has Finnish column labels: `Sija`, `Joukkue`, `O`, `V`, `T`, `H`,
  `TM`, `PM`, `ME`, `P`, and `Vire`.
- `O` means ottelut, `V` voitot, `T` tasapelit, `H` häviöt, `TM` tehdyt maalit,
  `PM` päästetyt maalit, `ME` maaliero, and `P` points; provide an accessible
  legend or title attributes for these abbreviations.
- Form uses `V`, `T`, and `H` for win, draw, and loss. Each result has an
  accessible label such as `Voitto`, `Tasapeli`, or `Häviö`.
- While data is loading, show `Ladataan...`. *(Was `Ladataan sarjataulukkoa...`
  until #179. `loading.tsx` is the App Router's root loading state, so it also
  covers match lists, team pages and the region pickers, none of which render a
  standings table.)*
- If no finished matches are available, show `Sarjataulukkoa ei ole saatavilla.`
- If the API, database, or cache fails and no usable stored data exists, show
  `Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.`.
- The table must remain usable on narrow screens and have semantic table markup.

## API & Data

### Provider endpoints
Use the football-data.org v4 API with the `X-Auth-Token` header:

1. `GET /v4/competitions/PL`
  - Use `currentSeason.id` when its `startDate` has passed; before that season
    starts, use the most recent previous season whose `startDate` has passed.
   - Cache the competition metadata for 1 hour.
2. `GET /v4/competitions/PL/matches?season={seasonId}&status=FINISHED`
   - Cache the provider response for 15 minutes.
   - Persist normalized matches before calculating standings.

Relevant provider response shape:

```json
{
  "matches": [
    {
      "id": 123456,
      "utcDate": "2026-08-15T14:00:00Z",
      "status": "FINISHED",
      "matchday": 1,
      "homeTeam": { "id": 57, "name": "Arsenal FC" },
      "awayTeam": { "id": 61, "name": "Chelsea FC" },
      "score": { "fullTime": { "home": 2, "away": 1 } }
    }
  ]
}
```

### Stored data
Add a Drizzle/PostgreSQL table for normalized matches with:

- provider match ID, unique
- competition code
- season ID
- kickoff timestamp
- matchday, nullable
- home team provider ID and name
- away team provider ID and name
- finished home and away goals
- created and updated timestamps

Upserts must be idempotent so repeated synchronizations update an existing
provider match rather than creating duplicates. Standings are calculated from
finished rows for `PL` and the current season only; no standings table is
required for this feature.

### Calculation
For every team appearing in a finished match:

- played increments by one
- winner gets one win and three points
- draw gives both teams one draw and one point
- loser gets one loss and zero points
- goals for and against use the stored full-time goals
- goal difference is goals for minus goals against

Sort by points descending, goal difference descending, goals for descending,
then team name ascending for deterministic output. Form is the team's five most
recent finished matches ordered newest first, displayed in chronological order
within the five-result indicator.

### Application boundary
Expose the calculated standings through a server-side application function or
route used by the home page. Provider access must remain server-side; the API
key must never be sent to the browser.

### Read and refresh flow
When the user navigates to the home page, resolve standings in this order:

1. Read calculated standings from Redis when the standings cache entry is
  present and fresh.
2. If Redis has no usable entry, read current-season finished matches from
  PostgreSQL, calculate standings, and populate Redis with the result.
3. If PostgreSQL has no current-season matches, or its newest synchronized
  match data is older than the freshness threshold, refresh the current season
  and finished matches from football-data.org, upsert them into PostgreSQL,
  calculate standings, and populate Redis.

Use a configurable `FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS` value, defaulting
to `3600` seconds (1 hour). The provider response cache TTLs remain separate:
competition metadata is cached for 1 hour and the matches response for 15
minutes. The refresh threshold controls when stored match data is considered
recent enough for the page, not how long provider responses remain in Redis.

## Edge Cases
- A provider match with missing full-time goals or a non-`FINISHED` status is
  ignored and is not persisted as a completed result.
- A team with fewer than five finished matches shows all available form results.
- A team with no completed result cannot appear in the calculated table.
- Re-running synchronization for the same provider match does not duplicate it.
- The provider returns an empty match list: show the no-data Finnish message.
- The provider returns an error but stored current-season matches exist: show
  standings calculated from stored data and log the refresh failure.
- The provider returns an error while stored current-season matches are older
  than the freshness threshold: show the stale stored standings as a degraded
  response and log the refresh failure, provided the stored data is valid.
- The provider, cache, and database all fail with no stored data: show the
  Finnish error message and do not expose implementation details.
- A match has a postponed, cancelled, suspended, or otherwise non-final status:
  exclude it from standings until a later finished response is synchronized.
- Equal standings statistics use the deterministic team-name tie-breaker.

## Performance & Limits
- Respect the provider limit of 10 requests per minute.
- Never call football-data.org directly during every render; use Redis caching
  with the TTLs defined above.
- Synchronization should use at most two provider requests per cache miss for a
  page request and should not perform one request per team or match.
- Database queries must restrict by competition and season and calculate from
  the normalized local dataset.
- The page should render from Redis or PostgreSQL without waiting for a
  provider request when local match data is newer than the configurable
  freshness threshold.

## Security & Secrets
- Read the provider key from `FOOTBALL_DATA_API_KEY` on the server only.
- Do not commit API keys, local `.env` files, or credentials.
- Keep `.env.example` limited to variable names and empty/example values.
- Do not include provider errors, request headers, or secrets in user-facing
  responses.

## Acceptance Criteria
- [ ] The home page shows a Finnish Premier League standings table calculated
      from normalized finished match data, not from a provider standings
      endpoint.
- [ ] The table includes position, team, played, won, drawn, lost, goals for,
      goals against, goal difference, points, and five-match form.
- [ ] The current Premier League season is resolved through the provider and
      finished matches are synchronized and upserted into PostgreSQL.
- [ ] Repeated synchronization of the same provider response does not create
      duplicate matches.
- [ ] Standings calculations match the defined points, goal, sorting, and form
      rules.
- [ ] Provider responses are cached using the specified 1-hour metadata and
      15-minute match TTLs.
- [ ] The read path checks Redis first, then PostgreSQL, and refreshes from the
  provider only when PostgreSQL has no data or data older than the
  configurable one-hour default freshness threshold.
- [ ] Local development requires and uses PostgreSQL and Redis, with setup
  documented for both services.
- [ ] Provider access and `FOOTBALL_DATA_API_KEY` remain server-side.
- [ ] Loading, empty, refresh-failure, and total-failure states use the exact
      Finnish strings specified above.
- [ ] Unit and integration tests cover calculation, synchronization, caching,
      and the listed edge cases.
- [ ] `npm run typecheck`, `npm run lint`, and `npm test` pass.

## Tests Required
- `tests/unit/lib/standings.test.ts`
  - calculate a normal win/draw/loss table
  - calculate goal difference and points
  - apply deterministic tie-breakers
  - limit form to five results and handle fewer than five
  - ignore incomplete/non-finished matches
- `tests/unit/lib/football-data.test.ts`
  - map the provider response to normalized match data
  - reject or ignore missing full-time scores
  - include the required authorization header without exposing it in output
- `tests/unit/lib/cache.test.ts`
  - verify the competition metadata and match TTLs are passed to the cache
  - verify cached provider data avoids another provider request
- `tests/integration/standings.test.ts`
  - synchronize a provider response, persist it, and calculate the expected
    standings from the stored matches
  - verify an identical synchronization is idempotent
  - verify stored data is used when provider refresh fails
- `tests/unit/app/page.test.tsx` or the chosen page-level test location
  - verify Finnish heading, table labels, form labels, loading, empty, and
    error states

## Files To Update
- `specs/001-premier-league-match-based-standings.md`
- `src/db/schema.ts` and a generated Drizzle migration
- `src/lib/` for provider client, synchronization, and standings calculation
- `src/app/page.tsx` and any server-side route or data boundary it needs
- `tests/unit/` and `tests/integration/`
- `README.md` with the feature's local setup or data-flow notes, if needed
- `.env.example` with `FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS=3600`
- `decisions/001-premier-league-match-based-standings.md` during implementation

## Open Questions
- None. The first implementation requires PostgreSQL and Redis locally, uses
  the cache → database → provider refresh flow above, starts with a one-hour
  configurable freshness threshold, and displays team names exactly as
  returned by football-data.org.
