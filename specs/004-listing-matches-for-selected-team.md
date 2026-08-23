# 004 — Listing matches for a selected team

## Summary
Let a user click a team in the standings table to see that team's full
match list for the selected season — played results and upcoming
fixtures together, in chronological order.

## Scope

### In scope
- Team names in the standings table become links to a new
  `/joukkue/[id]` page, carrying the currently selected season (`?kausi=`).
  **Route naming**: per project convention, everything the user sees —
  including the URL itself — is Finnish, while everything in the
  codebase (folder/file names) is English. The App Router folder
  determines the URL 1:1 by default, so this route is implemented as
  `src/app/team/[id]/page.tsx` (English folder) with a `next.config.ts`
  rewrite mapping the public `/joukkue/:id` to it — the rewrite is
  server-side, so the browser always shows `/joukkue/:id`, never
  `/team/:id`. `kausi`/`kierros` don't have this tension at all: they're
  query-string keys, not filenames, so they were already free to stay
  Finnish with no extra machinery.
- The team page lists every stored match for that team in that season —
  both `FINISHED` and not-yet-played matches — ordered by kickoff time,
  oldest first. Not-yet-played matches show the fixture (date, opponent,
  home/away) with no score.
- The team page has its own season selector (`Kausi`, reusing the same
  selectable-seasons list and Finnish label as the home page), so a user
  can browse the same team across seasons without going back to the home
  page. No round selector on the team page — unchanged from before, the
  team page always shows the whole season's matches for that team.
- **Foundational data-model change**, required for the above: the
  `matches` table currently only ever stores `FINISHED` matches
  (`homeGoals`/`awayGoals` are `NOT NULL`, there is no `status` column,
  and `football-data.ts` hardcodes `&status=FINISHED` on the provider
  fetch and rejects anything else in `normalizeMatch`). This spec removes
  that restriction so the table can hold a season's full fixture list,
  played and upcoming. This is the same foundational gap flagged when
  scoping #70; doing it here means #70 and #71 inherit it for free.

### Out of scope
- Competitions other than Premier League (unchanged from existing scope).
- Any "next opponent" or fixture-difficulty UI beyond a plain match list.
- Editing the round selector (spec 003) to work on the team page — the
  team page shows the whole season's matches for that team, not filtered
  by round.
- A dedicated match-detail page (that's #71).
- Live/in-play score updates — the existing hourly refresh cadence
  (`FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS`) is unchanged; this is not a
  live-scores feature.

## UX / UI (Finnish strings)
- Standings table: each team name (`<th scope="row">`) becomes a link,
  same visible text, `href="/joukkue/{teamProviderId}?kausi={seasonId}"`,
  **only** when the standings are actually rendered (`result.status ===
  "ok"`) — the `empty` and `error` standings states never show team
  links, since there's no team data to link to in either case (there is
  no separate teams table independent of match rows).
- Team page heading: `{Joukkueen nimi} {kausiLabel}`, e.g.
  `"Arsenal FC 2025/26"`, matching the home page's heading pattern
  (`formatSeasonLabel`).
- Team page season selector: labelled `Kausi`, same options and Finnish
  label as the home page's selector. Changing it navigates to
  `/joukkue/{teamProviderId}?kausi={newSeasonId}` — same team, new
  season. Same plain-GET-form-with-`noscript`-fallback pattern as the
  existing selector, so it still works without JavaScript.
- Match list, one row per match, columns:
  - **Pvm** — kickoff date, `pp.mm.yyyy` (Finnish date format).
  - **Ottelu** — `"{Kotijoukkue} – {Vierasjoukkue}"` (en dash between
    team names), home team always listed first regardless of which side
    the selected team is on.
  - **Tulos** — `"{homeGoals}–{awayGoals}"` for `FINISHED` matches;
    **`"–"`** (a bare en dash) for anything without a final score yet.
  - **Kierros** — the matchday number, or blank if unknown (`null`).
- No separate "upcoming" section header — one chronological list. A
  played match and an unplayed one are visually distinguished only by
  the `Tulos` column (a score vs. a dash), which is enough given the
  list is already date-ordered.
- Empty state (team has zero stored matches for the season — see Edge
  Cases): **`"Otteluita ei ole saatavilla."`** (mirrors the existing
  standings empty-state copy).
- Error state (fetch/sync failure):
  **`"Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen."`** —
  the same message `/ottelut` uses, since this page also renders a match
  list.

  > **Amended by #128.** This originally specified the `Sarjataulukon`
  > ("standings table") message, reasoning that it was already the generic
  > "something went wrong" copy and no new string was needed. That left
  > this page telling the user the standings table failed to load while it
  > was showing a match list — the only one of the app's six pages whose
  > error copy did not name what the page shows. The rule is now: name the
  > page's primary content.
- Invalid `kausi` on the team page: same fallback banner pattern as the
  home page (`Kautta ei löytynyt. Näytetään kausi {seasonLabel}.`).
- Invalid/unknown team id (see Edge Cases):
  **`"Joukkuetta ei löytynyt."`** ("Team not found"), rendered instead of
  the match list. The season selector still renders in this state (the
  season list itself resolved fine; it's the team that wasn't found), so
  the user can try a different season for the same id without leaving
  the page.

## API & Data

### Schema migration
`src/db/schema.ts`:
```ts
status: text("status").notNull().default("FINISHED"),
homeGoals: integer("home_goals"),   // was NOT NULL
awayGoals: integer("away_goals"),   // was NOT NULL
```
The `.default("FINISHED")` exists only so `drizzle-kit generate` can
backfill the existing rows (which are, today, always finished matches)
without an interactive prompt — the application always writes `status`
explicitly on every insert going forward. No new index: the existing
`matches_competition_season_idx` on `(competition_code, season_id)`
already scopes every query this feature needs to at most one season's
worth of rows (≤ ~380), so filtering by team id or status in-app is
cheap, matching the precedent set by round-filtering in spec 003.

### `football-data.ts`
- The provider fetch drops the `&status=FINISHED` query filter —
  `/competitions/PL/matches?season={seasonId}` returns every match for
  the season regardless of status in one call, so **no new provider
  request volume**.
- `normalizeMatch` no longer rejects non-`FINISHED` matches. It now
  requires `id`, `status`, `utcDate`, and both teams' `id`/`name` (same
  as before, minus the `status !== "FINISHED"` check); `homeGoals`/
  `awayGoals` map to `null` when the provider doesn't report a final
  score yet, instead of being required.
- `getFinishedMatches` is renamed `getSeasonMatches` to reflect that it
  now returns the season's full fixture list, not just finished ones.

### `standings-service.ts`
- **Critical correctness requirement**: `calculateStandings` must only
  ever receive `FINISHED` matches. Both places that build its input must
  filter explicitly:
  - The DB query (`db.select().from(matches).where(...)`) gains
    `eq(matches.status, "FINISHED")` alongside the existing
    competition/season filter.
  - The freshly-fetched `providerMatches` array (post-refresh) is
    filtered to `status === "FINISHED"` before
    `calculateStandings(filterByRound(...))` runs.
  Without this, an unplayed match's `null` goals would reach the
  win/loss comparison in `calculateStandings` and silently miscount it
  as a draw — this is the single highest-risk regression in this spec
  and must be covered by a test that fails loudly if the filter is
  dropped (see Tests Required).
- The season-sync logic (read stored → check `needsRefresh` → fetch from
  provider → `synchronizeMatches`) is extracted into a shared internal
  helper — e.g. `getSyncedSeasonMatches(seasonId, activeSeasonId)` — so
  both `getPremierLeagueStandings` (which then filters to `FINISHED` for
  the standings table) and the new `getTeamMatches` reuse the same sync
  path instead of duplicating it. This is a refactor of existing, tested
  code; behavior for `getPremierLeagueStandings` must not change.
- **Season selector reuse**: `SeasonRoundSelector` currently owns both
  navigation (building the target URL, preserving unrelated query params
  via `window.location.search`, per the PR #78 Sourcery fix) and the
  `<form>` wrapping both the `Kausi` and `Kierros` controls together —
  needed so a no-JS submit posts both at once. The team page needs the
  same season-switching behavior and Finnish label, but targeting
  `/joukkue/{id}` instead of `/`, and with no `Kierros` control at all
  (a nested `<form>` isn't valid HTML, so the team page can't just embed
  the existing component as-is). The season `<select>` + its
  navigate/preserve-params logic should be extracted into a shared,
  presentational piece both the home page's combined selector and the
  team page's season-only selector use, rather than duplicating the
  navigation logic in two places. Exact component boundary (e.g. a
  `SeasonSelect` building block vs. a `basePath` prop on the existing
  component) is an implementation-time call, not prescribed here.
- New `getTeamMatches(teamProviderId, seasonId, activeSeasonId):
  Promise<TeamMatchesResult>`: runs the shared sync helper, then filters
  the season's matches to ones where the team is home or away, sorted by
  `kickoffAt` ascending. Visiting the team page directly (without having
  loaded the standings page first) still triggers a sync if the season
  isn't cached/stored yet — it does not depend on the home page having
  run first.
- **Caching**: the existing `standings:{code}:{seasonId}` Redis cache is
  unchanged (still standings-only, still bypassed when a round is
  selected per spec 003). Team match lists are not cached separately in
  v1 — same reasoning as round-filtering in spec 003: filtering an
  already-fetched, season-bounded match list in-app is cheap enough that
  a dedicated cache isn't justified yet.

## Edge Cases
- **Non-existent or non-numeric team id in the URL**: render
  `"Joukkuetta ei löytynyt."` — do not 500, do not throw. A team "exists"
  for this purpose if it appears as home or away in at least one stored
  match for the requested season; there is no separate teams table.
- **Valid team id, but it never played in the requested season** (e.g. a
  team that was relegated the prior season and the user manually edits
  the URL to a season it wasn't in): same `"Joukkuetta ei löytynyt."`
  state — this spec has no independent notion of "team" outside of
  "team that appears in this season's matches."
- **Team has stored matches, but all are still unplayed** (very early in
  a season): renders the full fixture list with every `Tulos` cell as
  `"–"` — not the empty state, since matches *do* exist, they just
  haven't been played. The empty state is reserved for genuinely zero
  stored matches.
- **Invalid `kausi` parameter**: same fallback-to-active-season behavior
  as the home page, with the same Finnish banner.
- **Season sync fails** (provider unreachable and nothing stored yet):
  same generic error message as the home page's error state; the page
  must not throw an unhandled error.
- **A match's status is something other than `FINISHED` and not a
  recognizable "upcoming" status** (e.g. `POSTPONED`, `CANCELLED`,
  `SUSPENDED`, `AWARDED`): still rendered as a row with `Tulos: "–"` — no
  special per-status Finnish label in v1. This keeps the status-label
  mapping out of scope rather than guessing coverage for statuses this
  API plan may rarely surface.

## Performance & Limits
- No new provider call volume — the per-season fetch already happened;
  it now returns more matches per call (same request), not more calls.
- Migration is additive-only (`ADD COLUMN`, relax `NOT NULL`) — no data
  rewrite beyond the single backfill default, safe on the current row
  count (a few hundred rows per season × a handful of seasons).
- Team match list query is bounded by one season (≤ ~380 rows before the
  home/away filter), same bound as every other query in this codebase.
- **No pagination needed here**: a Premier League team plays at most 38
  matches per season (one per round, home + away combined), which is a
  normal single-page list. Pagination only becomes relevant for the
  season-wide, all-teams match list (#70), where a season has ~380
  matches — see the note below.

## Security & Secrets
- No new env vars, no secrets.
- The team id and season id are both validated before reaching a query:
  team existence is proven by presence in the query result itself (no
  raw id is used to construct anything beyond a parameterized
  `WHERE homeTeamProviderId = $1 OR awayTeamProviderId = $1`); `kausi`
  reuses the existing `parseSeasonParam` validation.

## Acceptance Criteria
- [ ] Clicking a team name in the standings table navigates to
      `/joukkue/{teamProviderId}?kausi={seasonId}` and shows that team's
      full match list for that season.
- [ ] The match list includes both `FINISHED` and not-yet-played matches
      in one chronological list, oldest first.
- [ ] A `FINISHED` match shows its final score; an unplayed match shows
      `"–"` in the `Tulos` column instead.
- [ ] `calculateStandings` never receives a non-`FINISHED` match — the
      standings table's output for a season is unchanged before and
      after this change (regression check).
- [ ] A non-existent team id (or a team absent from the requested
      season) shows `"Joukkuetta ei löytynyt."` without a server error.
- [ ] A season with zero stored matches for the team shows
      `"Otteluita ei ole saatavilla."`.
- [ ] An invalid `kausi` on the team page falls back to the active
      season with the existing Finnish banner pattern.
- [ ] Visiting the team page for a season that has never been synced
      still works — it triggers the same sync path the home page uses,
      not just a read of already-stored data.
- [ ] The team page's season selector changes the season for the same
      team (`/joukkue/{id}?kausi=...`) without a full round-trip through
      the home page, and works via a plain GET form submit with
      JavaScript disabled.
- [ ] Team names are links only in the standings table's `ok` state;
      the `empty` and `error` states render plain text, not links.
- [ ] `npm run test:unit` and `npm run test:integration` pass with no
      drop in coverage.

## Tests Required
- `tests/unit/lib/football-data.test.ts`: `normalizeMatch` accepts
  non-`FINISHED` matches with null goals, still rejects matches missing
  id/status/utcDate/team info; `getSeasonMatches` fetch no longer
  includes `&status=FINISHED` in the request URL.
- `tests/unit/lib/standings-service.test.ts`:
  - **The critical regression test**: seed stored/provider matches with
    a mix of `FINISHED` and non-`FINISHED` status, assert
    `calculateStandings` is called with only the `FINISHED` subset (via
    the existing `calculateStandingsMock` wrapper pattern), on both the
    DB-read path and the freshly-refreshed-from-provider path.
  - `getTeamMatches`: returns matches where the team is home or away,
    sorted by kickoff, includes both played and unplayed, excludes
    matches for other teams; triggers the shared sync path when nothing
    is stored yet; returns the "not found" case correctly when the team
    never appears in the season's matches.
  - `getPremierLeagueStandings` behavior is unchanged after the
    sync-helper extraction (existing test suite must still pass
    unmodified in intent, only refactored where the extraction requires
    it).
- `tests/unit/app/team/[id]/page.test.tsx` (new): renders the match
  list, the empty state, the not-found state, the invalid-season banner,
  and the error state, mirroring `tests/unit/app/page.test.tsx`'s
  structure; asserts the season selector renders and navigates to
  `/joukkue/{id}?kausi=...` (same id, new season) via a plain GET form.
- `tests/unit/app/page.test.tsx`: team names render as links only in the
  `ok` standings state, not in `empty`/`error`.
- Component test(s) for whatever the season-selector extraction produces
  (new file or extended existing one), covering the team page's
  season-only usage the same way `season-round-selector.test.tsx`
  already covers the home page's combined usage.
- `tests/integration/standings.test.ts`: extend or add a case that
  syncs a season containing both a finished and an unplayed match
  against real Postgres, and asserts the standings computation still
  excludes the unplayed one.
- A schema/migration check: confirm `homeGoals`/`awayGoals` accept
  `NULL` and `status` defaults correctly for a freshly migrated table
  (can be folded into the integration test above).

## Files To Update
- `src/db/schema.ts`
- `drizzle/migrations/` (new generated migration)
- `src/lib/football-data.ts`
- `src/lib/standings-service.ts`
- `src/lib/standings.ts` (if `NormalizedMatch`'s goals typing needs to
  stay non-null for `calculateStandings` — confirm during implementation
  whether a narrower type or a runtime filter is cleaner; either way the
  filter itself is mandatory per API & Data above)
- `src/app/page.tsx` (team names become links, `ok` state only)
- `src/app/team/[id]/page.tsx` (new — see the route-naming note below for
  why the folder is `team` while the URL stays `/joukkue/`)
- `next.config.ts` (new rewrite: `/joukkue/:id` → `/team/:id`)
- `src/components/season-round-selector.tsx` (refactored to share the
  season-select building block — see API & Data)
- possibly a new `src/components/season-select.tsx` (or equivalent),
  depending on the extraction approach chosen during implementation
- `tests/unit/lib/football-data.test.ts`
- `tests/unit/lib/standings-service.test.ts`
- `tests/unit/app/page.test.tsx`
- `tests/unit/app/team/[id]/page.test.tsx` (new)
- `tests/unit/components/season-round-selector.test.tsx` and/or a new
  component test file, depending on the extraction approach
- `tests/integration/standings.test.ts`
- `specs/004-listing-matches-for-selected-team.md` (this file)
- `decisions/004-listing-matches-for-selected-team.md` (written during
  implementation)

## Open Questions
None. Both prior open items are resolved:
- The team page **does** render its own season selector (`Kausi`),
  confirmed rather than deferred — see Scope, UX, API & Data (component
  reuse), and Acceptance Criteria above.
- Team names are links **only** in the standings table's `ok` state;
  `empty` and `error` states render plain text — confirmed explicitly
  rather than left as an implied consequence, and added as its own
  acceptance criterion and test.

## Note for #70 (listing matches for a selected season, all teams)
Not in scope here, but worth recording since this spec's data-layer work
directly enables it: once `matches` holds a season's full fixture list
(this spec), #70's season-wide, all-teams match list becomes a query
away — no further schema or provider changes needed.

#70's ~380 matches per season is too many for one page, but rather than
numbered pagination, the round is already the natural chunking unit in
football and the infrastructure already exists (`listSelectableRounds`,
`parseRoundParam`, `getMaxMatchday` from spec 003). Proposed shape for
#70, to consider when that spec is written:
- Default view: the *current* round (containing the next unplayed
  match, or the most recently completed one), not round 1 or a blank
  list — "what's happening now" is almost always what a visitor wants.
- `◀ Edellinen kierros` / `Seuraava kierros ▶` navigation between rounds,
  plus the existing round dropdown to jump directly to any round.
- Each round renders ~10 matches (all fixtures for that matchday), same
  row shape as this spec's team match list (`Pvm`, `Ottelu`, `Tulos`).
- Needs one new query, `getRoundMatches(seasonId, round)`, built on the
  same `getSyncedSeasonMatches` helper this spec introduces — no new
  sync/fetch logic.
