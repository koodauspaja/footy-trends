# 004 — Listing matches for a selected team: implementation decisions

Spec: `specs/004-listing-matches-for-selected-team.md`
Issue: #69

## Route naming: Finnish URL, English folder, via a `next.config.ts` rewrite

Decided mid-implementation, after the spec was already confirmed: the team
page's folder is `src/app/team/[id]` (English, per project convention for
code/filenames), but the public URL stays `/joukkue/:id` (Finnish, matching
everything else the user sees). `next.config.ts` adds a server-side rewrite
mapping `/joukkue/:id` → `/team/:id`; the browser never sees `/team/:id`.
`kausi`/`kierros` never had this tension — they're query-string keys, not
filenames, so they were already free to stay Finnish. `TeamSeasonSelector`
and the standings-table team links both target `/joukkue/...` directly, not
the internal folder path.

## Migration files are named explicitly, and the two pre-existing ones were renamed too

`drizzle-kit generate` defaults to whimsical auto-names
(`0000_light_clint_barton.sql`). Used `--name=add_match_status_and_nullable_goals`
for this migration, and — at the user's request, even though out of this
feature's original scope — renamed the two pre-existing migrations to
`0000_create_matches_table.sql` and
`0001_add_matches_competition_season_index.sql`.

This is safe for already-migrated databases: `drizzle-orm`'s migrator
(`node_modules/drizzle-orm/migrator.js`) tracks applied migrations by a
SHA-256 hash of the migration file's *content*, not its filename —
`_journal.json`'s `tag` field is only used to locate the file on disk. Renamed
the two files with `git mv` (content untouched, confirmed via `git diff
--stat` showing zero changes) and updated their `tag` entries in
`_journal.json` to match. Verified directly against the local Postgres
instance: the two pre-existing rows in `drizzle.__drizzle_migrations` kept
their original hashes after the rename, and `npm run db:migrate` applied only
the new migration — no re-run, no error.

## `db:migrate` now loads `.env` itself

`src/db/migrate.ts` previously required `DATABASE_URL` to already be
exported into the shell (`tsx` doesn't populate `process.env` from `.env`
files). Added the same guarded `process.loadEnvFile(".env")` that
`vitest.config.ts` already uses for the same reason, so `npm run db:migrate`
works standalone. `drizzle-kit generate`/`push` were already unaffected —
they load `.env` themselves.

## `NormalizedProviderMatch.competitionCode` is `string`, not the `"PL"` literal

This one type change avoided introducing a second, parallel "match row" type
in `standings-service.ts`. A DB row (`typeof matches.$inferSelect`) has
`competitionCode: string`; `NormalizedProviderMatch` originally had
`competitionCode: "PL"`. Loosening the literal to `string` (the value is
still always `"PL"` at runtime) makes a `StoredMatch` structurally satisfy
`NormalizedProviderMatch` — so `standings-service.ts` can treat DB-sourced
and freshly-fetched-from-provider matches identically via one type, instead
of a redundant `MatchRow` union/wrapper type.

## Season sync is now one shared path — and a real caching bug surfaced during the extraction

`getSyncedSeasonMatches` centralizes the read-stored → check-`needsRefresh` →
fetch-from-provider → `synchronizeMatches` sequence that
`getPremierLeagueStandings` already had, so `getTeamMatches` reuses it
instead of duplicating the sync logic. It never throws — a failed refresh
falls back to whatever's stored, returning `refreshFailed: true` so callers
can tell "stale but present" apart from "genuinely nothing."

The extraction surfaced a real behavior regression, caught by the existing
test suite (not something new written for this feature): the original code
only wrote to the Redis standings cache after a *successful* refresh or when
serving fresh, un-stale storage directly — never after falling back to stale
data post a failed refresh. The first version of the refactor wrote the
cache unconditionally whenever `round` was absent, which would have started
caching admittedly-stale fallback data for a full 15-minute TTL. Fixed by
gating the cache write on `!refreshFailed` too. `falls back to stored
matches when a refresh fails but stored data exists` (pre-existing test,
unmodified) is what caught this.

## `calculateStandings` boundary: `toFinishedMatches` as an explicit type-guard filter

Per the spec's flagged critical-correctness requirement,
`calculateStandings` must never see a non-`FINISHED` match. `toFinishedMatches`
filters on `status === "FINISHED" && homeGoals !== null && awayGoals !== null`
as a TypeScript type guard, narrowing to a type `calculateStandings`'s
existing `NormalizedMatch` signature accepts unmodified — `calculateStandings`
itself was not touched. Applied on both paths that feed it: the DB-read path
and the freshly-refreshed-from-provider path, each with its own dedicated
regression test asserting `calculateStandings` was called with only the
`FINISHED` subset.

## `not_found` vs. `empty` for `getTeamMatches`: resolved a real ambiguity in the spec

The spec's Edge Cases listed both "non-existent team id" and "team has zero
stored matches for the season" as separate cases with different Finnish
messages — but there's no independent teams table, so both are the *same*
database signal (zero rows for that team) when the season itself has data.
Resolved during implementation: `"not_found"` means the season has matches
but this team isn't among them; `"empty"` means the season itself has zero
stored matches at all (nothing synced yet, or a refresh that genuinely found
nothing). This is a clarification of an underspecified spec detail, not a
scope change — noted here per the project's spec/decision-drift convention.

## Component reuse: `SeasonSelect` extracted, `PageShell` extracted

`SeasonSelect` (`src/components/season-select.tsx`) is the `Kausi`
label+`<select>` only — no `<form>`, no navigation — so both
`SeasonRoundSelector` (home page, `Kausi` + `Kierros` in one form) and the
new `TeamSeasonSelector` (team page, `Kausi` only, targeting
`/joukkue/{id}`) compose it without duplicating the season markup or
options-rendering. `PageShell` (heading + `<main>` wrapper) was identical
between the home page and the new team page, so it's now a shared component
too.

## Verified against the live provider

Confirmed directly against `api.football-data.org` that the 2026/27 season's
fixtures are already published ahead of a ball being kicked: 380 matches,
330 `SCHEDULED` + 50 `TIMED`, 0 `FINISHED`. Real-world confirmation that the
non-`FINISHED`-status handling this spec adds isn't a hypothetical — this
exact shape of data exists today, even though that season isn't selectable
in the app yet (unrelated, existing behavior from spec 002).

## Verification

- `npm run typecheck`, `npm run lint` clean.
- 146 unit tests passing, 100% statement/branch/function/line coverage.
- 9 integration tests passing against real Postgres/Redis, including a new
  case that stores a finished and an unplayed match side by side and
  confirms both the schema (`NULL` goals, non-default `status` round-trip)
  and the standings exclusion.
- Manual browser verification: standings table links to team pages,
  `/joukkue/:id` rewrite serves `src/app/team/[id]` transparently, team
  page's own season selector works and preserves the team id, unknown team
  id shows the not-found state with the season selector still usable, no
  console errors.
