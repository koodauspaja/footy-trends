# 003 — Standings after selected round

## Summary
Let a user pick a round (matchday) alongside the season, so the standings
table shows the table as it stood after that round instead of only the
full, current-season table.

## Scope

### In scope
- A round selector on the home page, next to the existing season selector.
- Standings computed from all `FINISHED` matches with `matchday <= selected
  round` for the selected season, using the existing `calculateStandings`
  function unchanged.
- The selected round reflected in the URL (`?kausi=...&kierros=...`), so a
  specific round's table is shareable/bookmarkable, matching the season
  selector's existing pattern.
- An explicit "whole season" option in the round selector that clears the
  `kierros` param and returns to today's full-season view.

### Out of scope
- Changing `calculateStandings`, the `matches` schema, or the football-data.org
  fetch/cache logic (`getFinishedMatches`, `getSeasonContext`).
- A per-team or per-match view — this only changes which matches feed the
  existing standings table.
- Any new caching layer (see Caching under API & Data).

## UX / UI (Finnish strings)
- New selector label, next to `Kausi`: **`Kierros`**.
- Round selector options: **`Koko kausi`** (value: absent/cleared — the
  default), followed by **`Kierros 1`**, **`Kierros 2`**, ... up to the
  highest matchday with at least one stored match for the selected season.
- Invalid `kierros` param (not a positive integer, or higher than any stored
  matchday for the season): reuse the existing invalid-season banner pattern
  at `src/app/page.tsx:70-77` ("Kautta ei löytynyt. Näytetään kausi X.") with
  round-specific wording: **`Kierrosta ei löytynyt. Näytetään koko kausi.`**
- No changes to the standings table itself (headings, column labels) —
  same columns, just a shorter match list feeding them.
- Both selectors appear in the same form, rendered by the renamed
  `SeasonRoundSelector` component (see Files To Update).

## API & Data
- No new endpoints and no new football-data.org calls. This is purely a
  filter over matches already fetched and stored in Postgres by the
  existing `getPremierLeagueStandings` flow.
- **Caching**: no new cache key. When `kierros` is present, the round-scoped
  request bypasses the existing full-season Redis cache
  (`standings:${COMPETITION_CODE}:${seasonId}`, 15 min TTL) — that cache
  stores only the final aggregated `TeamStanding[]`, not raw matches, so it
  cannot answer a per-round query. Instead, the same `matches` DB query
  already used on a cache miss (`src/lib/standings-service.ts:41-45`,
  indexed via `matches_competition_season_idx`) is filtered in-app to
  `matchday <= round` before calling `calculateStandings`. Filtering a
  season's matches (≤ ~380 rows) in memory is cheap enough that no
  additional cache is introduced for this in v1.
- When `kierros` is absent, behavior is unchanged: the full-season cache is
  used exactly as today.
- The active-season refresh logic (`needsRefresh`, provider fetch,
  `synchronizeMatches`) is unaffected — the round filter is applied to
  whichever match list is ultimately resolved (cached, stored, or freshly
  refreshed), after that resolution happens.

## Edge Cases
- **Matches with `matchday === null`**: excluded from any round-filtered
  view (can't be attributed to a round), but still included in the
  round-absent (whole season) view, matching today's behavior exactly.
- **Round higher than any stored matchday, zero, negative, or non-numeric**:
  treated as invalid — same fallback pattern as an invalid `kausi`: show the
  banner, render the whole-season table.
- **Round selected for a season with zero stored matches**: the round
  selector shows only `Koko kausi` (no matchday options), consistent with
  the season simply having an empty table today.
- **Round selected where no matches have matchday <= that round yet**
  (e.g. selected round is technically valid — some later round has matches —
  but nothing has been played up to it): renders the existing `empty`
  standings state (`Sarjataulukkoa ei ole saatavilla.`), same as a season
  with no matches.
- **Round selector combined with an invalid season**: season validation
  still takes priority — if the season itself falls back, the round filter
  is evaluated against the *fallback* season's matchdays, not the originally
  requested one.

## Performance & Limits
- No new rate limits — no additional football-data.org calls are made.
- Per-request cost is one extra in-memory `Array.prototype.filter` over an
  already-fetched match list (bounded by a season's match count, ~380 for a
  20-team league) — negligible compared to the existing DB query and
  `calculateStandings` call.

## Security & Secrets
- No new env vars, no secrets involved. `kierros` is validated the same way
  `kausi` is today (`POSITIVE_INTEGER` regex, then checked against known
  matchdays) before it reaches any DB query, so it cannot be used for
  injection or to probe arbitrary data.

## Acceptance Criteria
- [ ] Selecting a round shows standings computed only from `FINISHED`
      matches with `matchday <= round` for the selected season.
- [ ] The round selector defaults to `Koko kausi` when `kierros` is absent,
      and the resulting table matches today's full-season output exactly
      (no regression).
- [ ] `kierros` is reflected in the URL, and loading that URL directly
      reproduces the same filtered table (no client-only state).
- [ ] An invalid `kierros` value shows the round-specific fallback banner
      and renders the whole-season table, without crashing or 500ing.
- [ ] The round selector's options are derived from the selected season's
      actual stored matchdays, not a hardcoded round count.
- [ ] Selecting `kierros` does not add any new football-data.org request or
      new Redis cache key (verified via test mocks / call assertions).

## Tests Required
- `tests/unit/lib/standings.test.ts` or a new
  `tests/unit/lib/standings-service.test.ts` case: filtering matches by
  `matchday <= round` before `calculateStandings` produces the expected
  subset table (happy path), and excludes `matchday: null` matches.
- `tests/unit/lib/rounds.test.ts` (new, mirroring `seasons.test.ts`'s
  coverage of `parseSeasonParam`): parsing/validating the `kierros` param —
  absent, valid, invalid (non-numeric, zero, negative, exceeds known
  matchdays).
- `tests/unit/app/page.test.tsx`: renders the round selector, shows the
  fallback banner on an invalid `kierros`, and that the round filter and
  season filter compose correctly (invalid season + valid round for that
  fallback season, etc.).
- Component test for the renamed `SeasonRoundSelector` component.

## Files To Update
- `specs/003-standings-after-selected-round.md` (this file)
- `src/app/page.tsx`
- `src/lib/standings-service.ts`
- `src/lib/rounds.ts` (new — round parsing/validation, mirrors
  `src/lib/seasons.ts`'s `SeasonParamResult`/`parseSeasonParam` shape)
- `src/components/season-selector.tsx` → renamed
  `src/components/season-round-selector.tsx` (see below)
- `tests/unit/lib/rounds.test.ts` (new)
- `tests/unit/lib/standings-service.test.ts`
- `tests/unit/app/page.test.tsx`
- `decisions/003-standings-after-selected-round.md` (written during
  implementation)

## Open Questions
None. The two implementation choices below were left to the implementer's
judgment and are resolved here for precision:
- Round parsing/validation lives in a new `src/lib/rounds.ts`, mirroring
  `seasons.ts`'s `SeasonParamResult`/`parseSeasonParam` shape, since valid
  rounds are season-scoped (which matchdays exist depends on the season).
- The round selector is folded into the same `<form>` as the season
  selector rather than a separate component/form, so changing either
  control resubmits both `kausi` and `kierros` together and neither
  selection is lost when the other changes. `season-selector.tsx` is
  renamed `season-round-selector.tsx` to reflect that it now renders both
  controls.
