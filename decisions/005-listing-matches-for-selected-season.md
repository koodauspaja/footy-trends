# 005 — Listing matches for a selected season: implementation decisions

Spec: `specs/005-listing-matches-for-selected-season.md`
Issue: #70

## Route naming: same Finnish-URL/English-folder pattern as spec 004

`/ottelut` (public, Finnish) rewrites to `src/app/matches` (folder, English)
via `next.config.ts`, exactly like `/joukkue/:id` → `src/app/team/[id]`.

## Team links added to the season-wide match list, beyond the original spec draft

Raised and confirmed mid-implementation: the home page's standings table
already links team names to `/joukkue/:id`, so the season-wide match list
should offer the same navigation for consistency — otherwise it would be
the only match listing in the app without it. Added to the spec's UX/API
and Acceptance Criteria sections before implementing, not slipped in
silently. Both home and away team names in each row link to
`/joukkue/{teamProviderId}?kausi={seasonId}`, always (there's no
"empty"/"error" per-row state to withhold a link from — a row only exists
once its match data is already present).

## `getRoundMatches` and `resolveCurrentRound`: tightened from the original spec draft

The first spec draft gave `resolveCurrentRound` its own `null` handling for
an empty match list, and left `getRoundMatches`'s "ok" shape ambiguous about
returning `round`. Both were tightened before writing code, once it became
clear `getRoundMatches` already independently checks for an empty/matchday-
less season *before* ever calling `resolveCurrentRound` — so the callee
doesn't need to re-handle a case its only caller has already ruled out.
Final contracts:

- `resolveCurrentRound(matches, maxMatchday)` requires a **non-empty**
  `matches` list and a **non-null** `maxMatchday`; it always returns a
  `number`. No dead defensive branches to (not) cover.
- `getRoundMatches(seasonId, round, activeSeasonId)` returns
  `{ status: "ok", round, matches }` — `round` is always present in the
  `"ok"` case so the page can render it in the heading and the
  invalid-`kierros` fallback banner without recomputing it. `matches` may
  legitimately be `[]` (a postponed round) while still `"ok"`.

Kept the spec updated to match as this was decided, rather than letting the
decision record silently diverge from it (see `REVIEW_RULES.md`'s
spec/decision-drift check).

## Round dropdown/nav built from a pre-sync `getMaxMatchday` read — same trade-off the home page already accepts

The round dropdown and prev/next links use the page's own `getMaxMatchday`
call, matching exactly how the home page already builds its `Kierros`
dropdown (spec 003) — a plain DB read, not tied to `getRoundMatches`'s own
sync. Consequence: on the very first-ever visit to a season with nothing
stored yet, this read returns `null` before the sync (triggered separately,
inside `getRoundMatches`) has happened, so the round controls are briefly
absent even though the match table itself renders correctly. Verified this
exact behavior against the live provider: visiting `/ottelut?kausi=2026`
for the first time (2026/27's fixtures already published, nothing synced
yet) showed the round 1 table with no round dropdown or prev/next links; a
second visit — after the first request's sync had completed — showed the
full 38-round dropdown and the "Seuraava kierros ▶" link. Chose to accept
this rather than restructure `getRoundMatches` to also return `maxMatchday`
and have the page await a second round-trip — it self-heals on the next
request, and introducing a new pattern here would be inconsistent with the
one the home page already ships.

## Season widening: `selectUpcomingSeason` trusts the provider's advertised seasons, doesn't probe for populated fixtures

`selectActiveSeason` (spec 002) deliberately only considers already-started
seasons for `activeSeasonId` — the default and the never-refetch boundary
for past seasons. `selectUpcomingSeason` is a separate function over the
same `currentSeason`/`seasons[]` candidate pool, picking the nearest
**future**-dated one. It does not verify the provider has actually
populated that season's fixtures yet — if the provider lists a season with
a future `startDate` but no matches are published, `getRoundMatches` simply
reports `"empty"`, an already-existing, already-tested state. Confirmed
against the live API: `selectableSeasons` now lists `2026/27` ahead of
`2025/26` (the just-finished season), and its matches are all `SCHEDULED`
with null scores, rendering as `"–"` — the same non-`FINISHED` handling
spec 004 already introduced.

`activeSeasonId` is untouched by this: it stays the newest **started**
season, so the home page still defaults to the season actually being
played, not an empty upcoming one. Selecting the upcoming season from any
selector shows the standings page's existing `"empty"` state — no new
special-casing needed, confirmed live (`/?kausi=2026` shows the empty
standings message with the season/round selectors still usable).

## Verification

- `npm run typecheck`, `npm run lint` clean.
- 194 unit tests passing, 100% statement/branch/function/line coverage.
- 11 integration tests passing against real Postgres/Redis, including a new
  round-filtering case and a case confirming an upcoming, fully-unplayed
  season's fixtures persist and are retrievable through the same sync path
  used everywhere else.
- Manual browser verification against the live provider: home page's
  season dropdown lists `2026/27` first; `Kaikki ottelut` link carries the
  selected season to `/ottelut`; `/ottelut` shows the correct current round
  (last round for the finished 2025/26 season, round 1 for the unplayed
  2026/27 season) with working prev/next links and team links to
  `/joukkue/:id`; invalid `kausi`/`kierros` banners render correctly; the
  first-sync round-controls gap documented above was reproduced and
  confirmed to self-heal on the next request; zero console errors
  throughout.
