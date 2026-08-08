# Decision record: Premier League match-based standings

## Built

- Added a normalized PostgreSQL matches table with an idempotent provider match ID upsert.
- Added football-data.org season and finished-match mapping with the specified Redis TTLs.
- Added application-side standings calculation, deterministic sorting, and five-match form.
- Added the server-side Redis, PostgreSQL, and provider fallback flow and Finnish home-page table.

## Decisions

- Standings cache entries use a 15-minute TTL so the page can avoid recalculation while the provider response cache keeps its specified endpoint-specific TTLs.
- A failed refresh returns valid stored standings as a degraded response; only a failure without stored data produces the user-facing error state.
- Form is selected from the five newest results and then rendered oldest-to-newest within that five-result window.
- Before the provider's current season starts, season selection falls back to the most recent started previous season so the page can show the latest completed results.
- `getCurrentSeasonId` returns the selected season's start year (e.g. `2025`), not the provider's internal `currentSeason.id` (e.g. `2403`). Verified against the live API: `GET /v4/competitions/PL/matches?season={id}` 404s, while `?season={startYear}` returns the expected finished matches. The spec's reference to `currentSeason.id` described the wrong field for this endpoint; the start year is used consistently as the `seasonId` everywhere (cache keys, the stored `seasonId` column, and the query parameter).