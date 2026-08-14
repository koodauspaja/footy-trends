# 006 — Other competitions: implementation decisions

Spec: `specs/006-other-competitions.md`
Issue: #67

## Home page becomes a picker; standings move to `/sarjataulukko`

Confirmed in chat before implementation: `/` no longer shows standings —
it's a plain list of all 9 competitions, each linking to
`/sarjataulukko?kilpailu={code}`. The old `src/app/page.tsx` (standings +
`Kausi`/`Kierros` selectors) moved to `src/app/standings/page.tsx` with
`git mv` to preserve history, gaining `kilpailu` handling. Old bookmarked
`/?kausi=2025` URLs no longer show standings — a deliberate breaking
change, acceptable for a pre-production app, not a regression to fix.

## Route naming: same Finnish-URL/English-folder pattern as specs 004/005

`/sarjataulukko` → `src/app/standings` via a `next.config.ts` rewrite,
identical to `/joukkue/:id` → `src/app/team/[id]` and `/ottelut` →
`src/app/matches`.

## `competitionCode` threading, and `synchronizeMatches` needed no change

Every function that hardcoded `"PL"` gained a `competitionCode` parameter:
`getSeasonContext`, `getSeasonMatches`, `normalizeMatch` (football-data.ts),
and `getStandings` (renamed from `getPremierLeagueStandings`),
`getTeamMatches`, `getRoundMatches`, `getMaxMatchday`,
`getSyncedSeasonMatches` (standings-service.ts). Cache keys already
interpolated a competition-code string (`standings:PL:2025`,
`football-data:matches:PL:2025`) — these just became parameterized instead
of hardcoded.

`synchronizeMatches` needed **no signature change**: each
`NormalizedProviderMatch` already carries its own `competitionCode` field
(set by `normalizeMatch`), so the upsert already writes whatever
competition each match belongs to. The DB schema's `matches.competitionCode`
column already existed from the original schema — no migration.

## Competition names and flags

Per your correction mid-spec: use each competition's own native/official
name, no invented translations (e.g. `Bundesliga`, not a Finnish-ified
spelling). `PD` uses `"Primera Division (LaLiga)"` — the provider's own
name plus the more recognizable brand name in brackets, since neither
alone was ideal. Premier League keeps its existing `"Valioliiga"` — the one
deliberate exception, kept for continuity with already-shipped text rather
than applying the "use the native name" rule retroactively.

**Flags, not crests**: football-data.org's own terms require separate
consent from clubs/leagues to use their logos, which we don't have.
National flags (`area.flag`) are a different, much less restrictive
category and sidestep that question — confirmed in chat. Flag URLs and
competition names are hardcoded in `src/lib/competitions.ts` as static
config (not fetched live) so the picker renders without any API calls.

**A native `<select>` can't show a flag per option** — `<option>` only
renders text. `CompetitionSelect` shows the *currently selected*
competition's flag next to the dropdown instead of inside it; the picker
page (plain `<a>` links, not a `<select>`) shows a flag per competition
without this constraint. Documented here since the spec's acceptance
criterion ("the `Kilpailu` selector shows the same flags as the picker")
is only achievable in this adapted form, not literally.

## Heading text changes — one confirmed, one decided during implementation

- **`/sarjataulukko`**: `"Valioliigan sarjataulukko {season}"` →
  `"Valioliiga {season}"` for all 9 competitions — confirmed in chat before
  implementation, since the route itself already conveys "this is a
  standings table."
- **`/ottelut`**: changed from `"Ottelut {season}, kierros {round}"` to
  `"{competition name} {season}, kierros {round}"` (and the competition
  name alone for empty/error states) — **not explicitly confirmed**, a
  judgment call made during implementation. Reasoning: this page has no
  `Kilpailu` selector (per spec, competition is carried via links only),
  so the heading is the *only* place on `/ottelut` indicating which
  competition is showing. Leaving it as generic "Ottelut" would mean a
  Bundesliga visitor sees a page that looks identical to a Premier League
  one. Applied the same reasoning the `/sarjataulukko` change already used
  ("the specific name is more informative than a generic word"), extended
  consistently to the one other page with the identical structural gap.
  Flagged here explicitly per the project's spec/decision-drift
  convention — worth a second look in review since it wasn't pre-confirmed
  like the `/sarjataulukko` change was.

## No competition selector on `/joukkue/:id` or `/ottelut` — carried via a hidden field

Confirmed in chat: these two pages don't get their own `Kilpailu`
dropdown. `kilpailu` still has to survive both client-side navigation
(`TeamSeasonSelector`, `MatchesControls` already copy `window.location.search`
forward) and the plain no-JS GET form fallback — a plain HTML form
submission only sends its own named fields, dropping any other query
param. Both components got a `<input type="hidden" name="kilpailu">` so
the no-JS path doesn't silently lose the competition. Verified manually:
switching season on the team page for a non-default competition (BL1)
keeps `kilpailu=BL1` in the resulting URL.

## Component rename: `SeasonRoundSelector` → `StandingsControls`

`git mv`'d and renamed for consistency with `MatchesControls` (`/ottelut`'s
equivalent composed selector) now that it composes three controls
(`Kilpailu`, `Kausi`, `Kierros`) instead of two. Same rename applied to its
test file.

## Verification

- `npm run typecheck`, `npm run lint` clean.
- 225 unit tests passing, 100% statement/branch/function/line coverage.
- 12 integration tests passing against real Postgres/Redis, including a
  new case proving two competitions' matches and standings for the same
  season coexist without cross-contamination.
- 12 e2e tests passing against a real dev server, real Postgres/Redis, and
  the live football-data.org API — including new coverage for the
  competition picker and cross-competition checks (Bundesliga) on both
  `/sarjataulukko` and `/ottelut`. Existing e2e specs updated: `home.spec.ts`
  renamed `standings.spec.ts` and repointed from `/` to `/sarjataulukko`
  (the standings table moved), `matches.spec.ts`'s heading assertion
  updated for the new heading format, `team.spec.ts` repointed to click
  through from `/sarjataulukko` instead of `/`.
- Manual browser verification beyond the e2e suite: all 9 flags load with
  no broken images; `Kilpailu` dropdown lists all 9 competitions with
  correct names, including the accented `Campeonato Brasileiro Série A`;
  switching competitions updates the heading and URL correctly; the hidden
  `kilpailu` field correctly carries a non-default competition (Bundesliga)
  onto the team page, confirmed against real Bundesliga data (FC Bayern
  München).
