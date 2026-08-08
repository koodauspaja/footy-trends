# 002 — Season selector and backfill: implementation decisions

Spec: `specs/002-season-selector-and-backfill.md`
Issue: #57

## Selectable seasons are bounded by config, not by the provider

`GET /v4/competitions/PL` returns a `seasons[]` array with 130+ entries going
back to 1888, but the API plan only grants a handful of them. Verified against
the live API on 2026-08-08 with the project key:

| Season | Result |
| --- | --- |
| 2026 | fixtures published, `played: 0`, `startDate` 2026-08-21 |
| 2025, 2024, 2023 | `200`, 380 finished matches each |
| 2022 and earlier | `403` |

Rendering `seasons[]` directly would offer 1888 and fail on selection, so
`getSeasonContext` derives the list from the active season down to
`FOOTBALL_DATA_EARLIEST_SEASON` (default 2023). One env change covers an API
plan upgrade. Probing each season to discover the boundary was rejected: it
burns requests against the 10/min limit to rediscover a value that changes only
when the plan does.

## No schema migration, only an index

`matches.seasonId` already stored the season start year, so backfill needed no
column changes. The only DB change is `matches_competition_season_idx` on
`(competition_code, season_id)`, which is exactly how standings are queried.

## Past seasons are immutable

`needsRefresh` returns `false` for any season older than the active one that has
at least one stored match, regardless of row age. A completed season's results
never change, so `FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS` applies only to the
season being played. This is what makes lazy backfill affordable: a past season
costs one provider request in its lifetime.

`needsRefresh` is exported and unit tested directly rather than exercised
through a mocked database. It is the whole policy of this feature and it is
pure, so testing it in isolation is both cheaper and more precise than asserting
it indirectly.

## No explicit transaction around the upsert

The spec called for wrapping the match upsert in a transaction so a season is
never partially stored. On implementation this turned out to be unnecessary:
`synchronizeMatches` issues a single multi-row `INSERT ... ON CONFLICT DO
UPDATE`, which Postgres already applies atomically. 380 matches × 14 columns is
about 5,300 bind parameters, well inside the 65,535 limit, so the statement does
not need chunking either. Adding `db.transaction()` around one atomic statement
would be noise. If the upsert is ever chunked, the transaction becomes required.

## Invalid season parameters fall back instead of redirecting

The spec originally called for redirecting an unselectable `kausi` to `/`. That
cannot be done as a real HTTP redirect here: the selectable-season list must be
awaited before the range check is possible, and `src/app/loading.tsx` causes
Next to flush the streaming shell before that await resolves. `redirect()`
therefore degrades to `<meta http-equiv="refresh" content="1;url=/">`, giving a
one-second blank page. Confirmed identical in `next dev` and in a production
build, so it is not a dev-mode artifact.

Options considered:

- **Keep the soft redirect** — correct in browsers, but a blank second and a
  `200` with an empty body for anything that does not run scripts.
- **Add `middleware.ts`** for a hard 307 — covers syntax and below-floor values,
  but cannot check the upper bound without the active season, so it would leave
  two layers of validation and still fall back for `?kausi=2026`.
- **Fall back with a stated notice** — chosen. The active season renders with
  `Kautta ei löytynyt. Näytetään kausi 2025/26.` above the selector. No delay,
  no blank frame, and the substitution is visible rather than silent.

The spec was amended to match; this is a deliberate change, not drift.

## Season resolution failure is handled in the page

`getPremierLeagueStandings` catches its own failures, but `getSeasonContext` is
now called before it and can throw when the provider and cache are both
unavailable. `resolveSeasonContext` in `src/app/page.tsx` catches that and
renders the existing Finnish error message. The selector is deliberately absent
in that state — with no resolvable season list there is nothing to select. It
remains visible in the empty and error standings states, where a season list
does exist.

## Testing Library cleanup was missing

The new component tests render the same component repeatedly and immediately
failed with duplicated DOM nodes. Testing Library only auto-registers `cleanup`
when Vitest globals are enabled, which this project does not use, so renders
were leaking between tests in a file. Existing tests had not tripped over it
because each one queried distinct text. `afterEach(cleanup)` was added to
`vitest.setup.ts`; this fixes latent cross-test pollution for the whole suite,
not just the new tests.

## Integration tests never loaded `.env`

`npm run test:integration` failed with `password authentication failed for user
"carlos"`: Vitest does not populate `process.env` from `.env` files, so
`src/db/index.ts` fell back to a local socket and the current OS user. The
tests only passed for anyone who had already exported `DATABASE_URL` and
`REDIS_URL` into their shell. This predates this branch — `main` has the same
`test:integration` script, the same `process.env.DATABASE_URL!`, and no env
loading in `vitest.config.ts`.

Fixed with Node's built-in `process.loadEnvFile(".env")` in `vitest.config.ts`,
guarded by an existence check. `loadEnv` from Vite would have worked too, but
`vitest/config` does not re-export it in v4 and `vite` is not a declared
dependency of this project, so importing it directly would rely on hoisting.
The built-in needs Node >= 20.12 and the project already requires 24.

Because the interval is now actually read from `.env`,
`tests/unit/lib/standings-service.test.ts` pins
`FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS` with `vi.stubEnv` and a module reset
rather than relying on the default. It previously passed only because no env
file was loaded at all.

## Empty seasons now report `empty` rather than `ok`

`getPremierLeagueStandings` previously cached and returned an empty standings
array as `status: "ok"`, which rendered an empty table instead of the Finnish
no-data message. With one fixed season that path was effectively unreachable;
with a season selector it is one click away. Both the cached and freshly
calculated paths now go through a single `toResult` helper that maps an empty
array to `status: "empty"`.

## Verification

- `npm run typecheck`, `npm run lint` clean.
- 57 unit tests, 8 integration tests passing.
- `matches_competition_season_idx` confirmed present in the local database.
- Live backfill of `?kausi=2023` produced the correct 2023/24 table: Manchester
  City, Arsenal, Liverpool in the top three.
