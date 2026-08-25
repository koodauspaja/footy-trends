# 005 — Listing matches for a selected season

> **Routes and names moved by `specs/012-finnish-urls-english-code.md`
> (#142).** The football-data.org pages are now under `/ulkomaat/` —
> `/ulkomaat/sarjataulukko`, `/ulkomaat/ottelut`, `/ulkomaat/joukkue/:id`
> — and the old top-level paths redirect there permanently. English paths
> such as `/standings` no longer serve a page; they redirect to their
> Finnish equivalent. In code, `kotimaa`/`ulkomaat` are now
> `domestic`/`foreign`. Paths named below refer to the pre-012 structure.


## Summary
Let a user browse a whole round's fixtures for a selected Premier League
season — all teams, not just one — defaulting to whatever round is
currently relevant, with round-by-round navigation instead of pagination.
This also widens the season selector, everywhere it appears, to include an
upcoming season once the provider has published its fixtures, even before
it starts.

## Scope

### In scope
- A new page at the public URL `/ottelut` (folder `src/app/matches`, per the
  project's URL-Finnish/folder-English convention — see
  `decisions/004-listing-matches-for-selected-team.md`), listing every match
  for one round of a selected season, all teams together.
- Round-based navigation: a round dropdown (reusing
  `listSelectableRounds`/`parseRoundParam`/`getMaxMatchday` from spec 003),
  plus `◀ Edellinen kierros` / `Seuraava kierros ▶` links to step one round
  at a time.
- Defaulting to the season's **current round** when no `kierros` param is
  given: the round containing the earliest not-yet-finished match, or the
  season's highest matchday if every match is `FINISHED`.
- A season selector on this page (reusing `SeasonSelect`), consistent with
  the home and team pages.
- A new `getRoundMatches(seasonId, round, activeSeasonId)` query in
  `standings-service.ts`, built on the existing `getSyncedSeasonMatches`
  helper — no new sync/fetch logic, no new caching layer.
- A link from the home page to `/ottelut?kausi={seasonId}`, carrying the
  currently selected season across.
- **Widening the selectable season list**: `getSeasonContext()` currently
  only ever returns already-started seasons (`selectActiveSeason` filters
  out anything with a future `startDate`). This spec adds one upcoming
  season to `selectableSeasons` — the next season by `startDate`, taken
  from the provider's `currentSeason`/`seasons[]` — whenever the provider
  already lists it, regardless of whether its fixtures are populated yet.
  This applies everywhere `selectableSeasons` is used: home page, team page,
  and this new page. `activeSeasonId` (the default season, and the
  never-refetch boundary for past seasons) is unaffected — it stays the
  newest **started** season.

### Out of scope
- Filtering the season-wide list by team (already covered by `/joukkue/:id`,
  spec 004).
- A match detail page (#71).
- Live/in-play score updates.
- Competitions other than Premier League.
- Listing more than one season ahead — only the immediate next season is
  ever added to the selector.

## UX / UI (Finnish strings)

**Page heading** (`src/app/matches/page.tsx`):
- Normal: `"Ottelut {seasonLabel}, kierros {round}"`, e.g.
  `"Ottelut 2025/26, kierros 3"`.
- No matches at all for the season (`empty` result, no round to show):
  `"Ottelut"`.

**Round navigation:**
- `"◀ Edellinen kierros"` — link to `kierros - 1`. Omitted entirely (not
  rendered, not disabled) at round 1.
- `"Seuraava kierros ▶"` — link to `kierros + 1`. Omitted entirely at the
  season's highest matchday.
- Round dropdown: same `Kierros` label as the existing round selector, but
  **no "Koko kausi" option** — every option is a concrete round number,
  since the round is this page's chunking mechanism, not an optional filter.

**Fallback banners** (same visual style as existing ones — amber, `role="status"`):
- Invalid `kausi`: reuses the exact existing string —
  `"Kautta ei löytynyt. Näytetään kausi {seasonLabel}."`
- Invalid `kierros`: `"Kierrosta ei löytynyt. Näytetään kierros {round}."`
  where `{round}` is the resolved current round. (Different wording from the
  home page's round fallback, which falls back to "whole season" — that
  option doesn't exist here.)

**States:**
- Empty season (no matches at all): `"Otteluita ei ole saatavilla."` (same
  string as the team page's empty state).
- Error (season context or match sync fails):
  `"Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen."` (new
  string — distinct from the standings page's, since this page isn't about
  standings).

**Match table** — same column shape as the team page (`src/app/team/[id]/page.tsx`):
| Pvm | Ottelu | Tulos |
|-----|--------|-------|
No `Kierros` column here (the whole table is already one round). Score
column shows `"{home}–{away}"` for a finished match, `"–"` otherwise —
identical logic to the team page. In the `Ottelu` column, both the home and
away team names are links to `/joukkue/{teamProviderId}?kausi={seasonId}`
— the same navigation the home page's standings table already offers,
extended here since this page also lists per-team matches. Always linked
(not conditional on match status): unlike the home page's standings links,
there's no "empty"/"error" *table row* state here to withhold a link from
— a row only exists when its match data is already present.

**Home page link** (`src/app/page.tsx`): a plain text link near the heading,
`"Kaikki ottelut"`, targeting `/ottelut?kausi={seasonId}` using the
currently selected season. Rendered regardless of standings status (unlike
team links, this isn't tied to standings data — it's just navigation to
another view of the same season).

## API & Data

No new provider endpoints. Reuses:
- `getSeasonContext()` (widened — see below).
- `getSyncedSeasonMatches` (internal to `standings-service.ts`, already
  shared by `getPremierLeagueStandings` and `getTeamMatches`).

**New/changed functions:**

`src/lib/football-data.ts`:
- `selectActiveSeason` stays unchanged (still the newest **started** season
  — this remains `activeSeasonId`, the default and the refresh boundary).
- New `selectUpcomingSeason(competition, now)`: same candidate pool as
  `selectActiveSeason` (`currentSeason` + `seasons[]`), but returns the
  season with the **earliest future** `startDate` (`startDate > now`), or
  `undefined` if none. A season with no `startDate` is never "upcoming" —
  only `selectActiveSeason` treats an undated season as already started.
- `getSeasonContext()` computes `upcomingSeasonId` the same way it computes
  `activeSeasonId` (start year of the resolved season) and passes it to
  `listSelectableSeasons`.

`src/lib/seasons.ts`:
- `listSelectableSeasons(activeSeasonId, earliestSeason, upcomingSeasonId?)`
  — if `upcomingSeasonId` is defined, it is prepended (newest first) ahead
  of `activeSeasonId`. No change to the floor/earliest-season logic.

`src/lib/rounds.ts`:
- New `resolveCurrentRound(matches, maxMatchday)`: given a **non-empty**
  match list and its season's `maxMatchday`, returns the matchday of the
  chronologically earliest match with `status !== "FINISHED"`, or
  `maxMatchday` if every match is `FINISHED`. Matches with
  `matchday === null` are ignored. The caller (`getRoundMatches`) is
  responsible for the empty-season case — it never calls this with an
  empty list, so the function has no null-handling of its own to test.

`src/lib/standings-service.ts`:
- New `getRoundMatches(seasonId, round, activeSeasonId)` where `round` is
  `number | undefined` (`undefined` means "give me the current round"):
  1. Calls `getSyncedSeasonMatches(seasonId, activeSeasonId)` (shared sync
     path — a season that's never been synced still triggers the provider
     fetch, same as `getTeamMatches`).
  2. If nothing is stored after sync: `{ status: "empty" }` (or `"error"`
     if the sync failed and nothing was ever stored).
  3. Computes the season's own `maxMatchday` from the synced matches
     (independent of the page's separate pre-sync `getMaxMatchday` read
     used for the round dropdown — see Edge Cases). If no match has a
     known matchday, `{ status: "empty" }`.
  4. Resolves the round to show: the given `round` if defined, otherwise
     `resolveCurrentRound(seasonMatches, maxMatchday)`.
  5. Returns `{ status: "ok", round, matches }`, `matches` filtered to
     `matchday === round` and sorted by `kickoffAt` ascending — `matches`
     may legitimately be empty (a postponed round), which is still `"ok"`.
  - No `not_found` case — unlike a team id, an out-of-range `round` is
    never passed in: the page only forwards a `round` once
    `parseRoundParam` has validated it against the page's own
    `getMaxMatchday` read, and passes `undefined` (not the raw value)
    whenever that validation fails.

**Caching:** unchanged. `getRoundMatches` performs no independent caching —
it filters the same synced season data `getTeamMatches` and
`getPremierLeagueStandings` already produce, per the existing TTLs
(1h competition metadata, 15m provider matches, DB as the source of truth
otherwise).

## Edge Cases
- Season has zero stored matches at all (including a genuinely-not-yet-
  published upcoming season): page shows `"Ottelut"` heading, the season
  selector, and `"Otteluita ei ole saatavilla."` — no round controls
  rendered (there's no `maxMatchday` to build them from).
- Selected season is the not-yet-started upcoming one, with fixtures already
  published: all matches are non-`FINISHED`, so `resolveCurrentRound`
  resolves to round 1 (earliest unfinished match). Scores render as `"–"`.
- Selected season is fully finished (past season): `resolveCurrentRound`
  resolves to `maxMatchday` (the last round) when no `kierros` param is
  given.
- Invalid `kierros` (non-numeric, zero, negative, or beyond `maxMatchday`):
  falls back to the resolved current round, with the banner. The banner is
  only shown once the page confirms a round was actually resolved (i.e. the
  page's `getRoundMatches` result is `"ok"`) — an invalid `kierros` on a
  season with no matches at all shows only the empty-season message, not an
  additional "falling back to round N" banner with no `N` to name.
- Invalid `kausi`: falls back to `activeSeasonId`, with the existing banner
  — same as the home and team pages.
- Both `kausi` and `kierros` invalid: both banners shown, same pattern as
  the home page (spec 003).
- A round with matchday numbers that skip (e.g. a postponed fixture moves a
  match to a different matchday than its neighbors): `listSelectableRounds`
  still lists every round 1..maxMatchday regardless of actual data; a round
  with zero matches in it shows `"Otteluita ei ole saatavilla."` inside the
  table area while keeping round navigation and the season selector intact.
- `getSyncedSeasonMatches` refresh fails but stored data exists (existing
  behavior from spec 004): served as `ok`/stale, not `error` — this page
  inherits that behavior unchanged, no new handling needed.
- **Known limitation, matching existing precedent**: the round dropdown and
  prev/next links are built from the page's own pre-sync `getMaxMatchday`
  read (same DB-only call the home page already uses for its round
  dropdown), not from `getRoundMatches`'s post-sync data. On the very first
  visit to a season that has never been synced, this read returns `null`,
  so the round controls are briefly absent even though the match table
  itself renders correctly (via `getRoundMatches`'s own sync). This
  self-heals on the next request once the season is stored. This is the
  same trade-off the home page's `Kierros` dropdown already accepts (spec
  003) — not a new gap introduced here.
- Season context itself fails to resolve (provider unreachable): generic
  error message, no season/round controls — matches the team page's
  existing pattern for this failure.
- The upcoming season is later than `earliestSeason`'s window logic — not
  applicable; `earliestSeason` only bounds the floor, not the ceiling.

## Performance & Limits
- No pagination: the round is the chunking unit (~10 matches per round for
  a 20-team league), matching the proposal already recorded in
  `specs/004-listing-matches-for-selected-team.md`.
- No new provider calls beyond the existing season sync path; `getRoundMatches`
  is an in-memory filter over already-synced data.
- No new Redis keys or TTLs.

## Security & Secrets
- No new environment variables.
- No secrets newly exposed; identical trust boundary to the existing
  provider integration (API key stays server-side).

## Acceptance Criteria
- [ ] `/ottelut?kausi={seasonId}` shows every match for that season's
      current round, all teams, sorted by kickoff time ascending.
- [ ] Without a `kierros` param, the page defaults to the round containing
      the next unplayed match, or the season's last round if everything is
      `FINISHED`.
- [ ] `◀ Edellinen kierros` / `Seuraava kierros ▶` navigate one round at a
      time and are omitted (not disabled) at the season's first/last round.
- [ ] The round dropdown lists every round 1..maxMatchday with no
      "Koko kausi" option.
- [ ] A `FINISHED` match shows its score; a not-yet-played match shows `"–"`.
- [ ] Both team names in each row link to
      `/joukkue/{teamProviderId}?kausi={seasonId}`.
- [ ] An invalid `kierros` falls back to the current round with the
      `"Kierrosta ei löytynyt. Näytetään kierros {round}."` banner.
- [ ] An invalid `kausi` falls back to the active season with the existing
      banner pattern.
- [ ] A season with zero stored matches shows `"Otteluita ei ole
      saatavilla."` with no round controls.
- [ ] Visiting `/ottelut` for a season that has never been synced triggers
      the same sync path as the home and team pages, not just a read.
- [ ] `selectableSeasons` includes the upcoming season (per
      `selectUpcomingSeason`) on the home page, team page, and this page,
      whenever the provider already lists it — even if it hasn't started.
- [ ] Selecting the upcoming season on the home page shows the standings
      empty state (no regression — no new special-casing needed there).
- [ ] The home page has a `"Kaikki ottelut"` link to
      `/ottelut?kausi={seasonId}` for the currently selected season.
- [ ] `npm run test:unit` and `npm run test:integration` pass with no drop
      in coverage.

## Tests Required
- `tests/unit/lib/rounds.test.ts`: `resolveCurrentRound` — earliest
  unfinished match by kickoff time, all-finished season falls back to
  `maxMatchday`, matches with null matchday ignored.
- `tests/unit/lib/football-data.test.ts`: `selectUpcomingSeason` — future
  `currentSeason`, future season only in `seasons[]`, no upcoming season
  (current season already started and nothing else future-dated), undated
  season never treated as upcoming.
- `tests/unit/lib/seasons.test.ts`: `listSelectableSeasons` with and without
  `upcomingSeasonId`, and when `upcomingSeasonId === activeSeasonId`
  (must not duplicate).
- `tests/unit/lib/standings-service.test.ts`: `getRoundMatches` — ok with an
  explicit round, ok defaulting to the current round when `round` is
  `undefined`, empty (no stored matches, no matchday known), error (sync
  failed and nothing stored), round filtering, sort order, an in-range
  round with zero matches still reporting `"ok"`, shares sync path (mock
  assertions matching the existing `getTeamMatches` describe block's style).
- `tests/unit/app/matches/page.test.tsx` (new): heading variants, round
  nav presence/absence at boundaries, table rendering, both team names
  linking to `/joukkue/:id?kausi=...`, all fallback banners, empty/error
  states, season selector, round dropdown without "Koko kausi".
- `tests/unit/app/page.test.tsx`: new `"Kaikki ottelut"` link assertion.
- `tests/integration/standings.test.ts`: extend to cover `getRoundMatches`
  against real stored rows (round filtering, chronological order), and a
  case confirming an upcoming-season fixture list persists and is
  retrievable through the same sync path.

## Files To Update
- `src/lib/seasons.ts`, `src/lib/football-data.ts`, `src/lib/rounds.ts`,
  `src/lib/standings-service.ts`
- `src/app/matches/page.tsx` (new)
- `src/components/` — round navigation/select pieces (reusing `SeasonSelect`
  where possible)
- `next.config.ts` — add the `/ottelut` → `/matches` rewrite
- `src/app/page.tsx` — add the `"Kaikki ottelut"` link
- Tests listed above
- `specs/005-listing-matches-for-selected-season.md` (this file)

## Open Questions
None — the three points below were resolved in chat before implementation:
- Invalid `kierros` fallback banner: `"Kierrosta ei löytynyt. Näytetään
  kierros {round}."` — confirmed.
- Home page link: `"Kaikki ottelut"`, plain text near the heading,
  targeting `/ottelut?kausi={seasonId}` — confirmed.
- A round with zero matches (e.g. fully postponed) shows the empty state
  for that round only; no auto-skip to another round — confirmed.
