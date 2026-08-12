# 003 — Standings after selected round: implementation decisions

Spec: `specs/003-standings-after-selected-round.md`
Issue: #72

## `getMaxMatchday` returns only the ceiling, not the full distinct set

The spec's UX section calls for a contiguous `Kierros 1..N` range, not
whichever matchdays happen to have a stored match. So `getMaxMatchday`
runs `MAX(matchday)` rather than `SELECT DISTINCT matchday`, and
`listSelectableRounds` builds `1..maxMatchday` itself. This also means a
gap in synced data (e.g. matchday 1 missing while matchday 5 exists) never
produces gappy options — it just means `round: 1` would filter to zero
matches, which already falls out of the existing empty-standings handling
with no special-casing required.

## `kierros=""` is treated as absent, not invalid — a deliberate deviation from `parseSeasonParam`

`parseSeasonParam` treats an empty string as invalid, because the season
selector never offers an empty option. The round selector's "Koko kausi"
option has `value=""` by design (see spec's UX section), and a plain
no-JS form submission with that option selected produces `kierros=` in
the query string. `parseRoundParam` special-cases `""` as `{ kind:
"absent" }` so choosing "whole season" never renders the invalid-round
banner. This is intentional divergence from the `seasons.ts` pattern, not
an oversight — noted here so it isn't "fixed" back into alignment later.

## Round filtering never touches the season-level cache — confirmed as scoped, not partially applied

As planned in the spec, `getPremierLeagueStandings` skips both the read
(`readCachedStandings`) and every write (`writeCachedStandings`) whenever
`round` is defined, on all three return paths (cache-hit-skipped,
refreshed-from-provider, served-from-storage). `filterByRound` is applied
to whichever match list is already in hand — stored or freshly
refreshed — so no additional DB query is introduced beyond the existing
one, and `needsRefresh` still evaluates against the *unfiltered* stored
matches, since staleness is a property of the season's data, not of a
round selection.

## `exactOptionalPropertyTypes` requires a conditional spread, not `round: possiblyUndefined`

`StandingsRequest.round` is `round?: number` (not `number | undefined`),
and the project's `tsconfig.json` has `exactOptionalPropertyTypes: true`.
Passing `{ round: selectedRound }` where `selectedRound` is `number |
undefined` fails to typecheck — the property must be entirely absent, not
present-with-`undefined`. `src/app/page.tsx` builds the call with
`...(selectedRound !== undefined ? { round: selectedRound } : {})`
instead.

## Component rename executed as specified, no drift

The spec's Open Questions resolved that `season-selector.tsx` becomes
`season-round-selector.tsx`, folding both controls into one `<form>` so
either control resubmits both `kausi` and `kierros`. Implemented exactly
as written — `git rm` on the old file/test, new
`SeasonRoundSelector`/`season-round-selector.test.tsx` in their place.

## Manual browser verification

No project skill exists yet for running this app, and no e2e test
infrastructure is committed (`tests/e2e/` is still a placeholder). Per
the UI-verification requirement, the feature was driven with an ad-hoc
Playwright script against `npm run dev` (Chromium installed via `npx`,
nothing added to the project): confirmed both selectors render with
Finnish labels, round options list `Koko kausi` through `Kierros 38` for
the fully-synced 2025/26 season, selecting a round updates the URL and
narrows every team's `O` (played) count correctly, clearing back to
`Koko kausi` removes `kierros` from the URL, an out-of-range
`?kierros=9999` renders the Finnish fallback banner, and no console
errors were logged. No test files or dependencies were added to the repo
for this — it was a one-time manual check.

## Verification

- `npm run typecheck`, `npm run lint` clean.
- 114 unit tests passing (100% statement/branch/function/line coverage).
- 8 integration tests passing against real Postgres/Redis, unaffected by
  the round changes (all pre-existing calls omit `round`).
- Manual browser verification as described above.
