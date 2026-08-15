# 006 — Other competitions: implementation decisions

Spec: `specs/006-other-competitions.md`
Issue: #67

This is part 1 of 2. The feature is split into two PRs after the first
combined attempt (#91) exceeded Sourcery's 150,000-diff-character review
limit and was skipped without an automated review pass. This PR is the
data-layer half; the UI half (competition picker, `/sarjataulukko`,
selectors) follows in a second, stacked PR against this branch.

## Split: parameterize first, land the UI separately

`src/lib/football-data.ts` and `src/lib/standings-service.ts` gained a
`competitionCode` parameter throughout (`getSeasonContext`,
`getSeasonMatches`, `normalizeMatch`, `getStandings` — renamed from
`getPremierLeagueStandings` — `getTeamMatches`, `getRoundMatches`,
`getMaxMatchday`), and cache keys for competition metadata, matches, and
standings are now scoped per competition code instead of hardcoding `PL`.
Every existing call site (`/`, `/joukkue/:id`, `/ottelut`) passes `"PL"`
explicitly, so this PR has zero user-visible behavior change — same routes,
same headings, same data. Verified with `npm run typecheck`, `npm run lint`,
`npm run test:unit` (199 tests, 100% coverage), `npm run test:integration`
(12 tests), and by running `npm run dev` and diffing `/`, `/ottelut`, and
`/joukkue/:id` against the pre-change app.

`synchronizeMatches` needed no signature change — each provider match
already carries its own `competitionCode` field, so it was already
competition-agnostic.

## `src/lib/competitions.ts` deferred to the UI PR

The list of supported competitions (codes, Finnish names, flag URLs) has no
runtime use anywhere in this PR — nothing here reads it, since every call
site still hardcodes `"PL"`. It belongs with its first consumer, the
competition picker, so it stays out of this PR entirely and lands in the
UI PR instead.

---

## Part 2: the UI layer

Everything below was implemented in the second, stacked PR (branch
`feature/006b-other-competitions-ui`, built on top of part 1's branch).

## Home page becomes a picker; standings move to `/sarjataulukko`

Confirmed in chat before implementation: `/` no longer shows standings —
it's a plain list of all 9 competitions, each linking to
`/sarjataulukko?kilpailu={code}`. The old `src/app/page.tsx` (standings +
`Kausi`/`Kierros` selectors) moved to `src/app/standings/page.tsx`, gaining
`kilpailu` handling. Old bookmarked `/?kausi=2025` URLs no longer show
standings — a deliberate breaking change, acceptable for a pre-production
app, not a regression to fix.

## Route naming: same Finnish-URL/English-folder pattern as specs 004/005

`/sarjataulukko` → `src/app/standings` via a `next.config.ts` rewrite,
identical to `/joukkue/:id` → `src/app/team/[id]` and `/ottelut` →
`src/app/matches`.

## Competition names and flags

Per an in-chat correction mid-spec: use each competition's own
native/official name, no invented translations (e.g. `Bundesliga`, not a
Finnish-ified spelling). `PD` uses `"Primera Division (LaLiga)"` — the
provider's own name plus the more recognizable brand name in brackets,
since neither alone was ideal. Premier League keeps its existing
`"Valioliiga"` — the one deliberate exception, kept for continuity with
already-shipped text rather than applying the "use the native name" rule
retroactively.

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
without this constraint.

## Heading text changes — extended to all three data pages, for consistency

`/sarjataulukko`, `/ottelut`, and `/joukkue/:id` have no `Kilpailu`
selector on `/ottelut` or `/joukkue/:id` (competition is carried via links
and a hidden field only), so each page's heading is the only place on
those two pages indicating which competition is showing:

- **`/sarjataulukko`**: `"Valioliigan sarjataulukko {season}"` →
  `"{competition name} {season}"` for all 9 competitions — confirmed in
  chat before implementation, since the route itself already conveys
  "this is a standings table."
- **`/ottelut`**: `"Ottelut {season}, kierros {round}"` →
  `"{competition name} {season}, kierros {round}"` — decided during
  implementation, reviewed and confirmed afterward via a self-review pass
  (Sourcery couldn't review the original combined PR due to its size). The
  reasoning: without this, a Bundesliga visitor would see a page
  indistinguishable from a Premier League one.
- **`/joukkue/:id`**: initially left unchanged (`"{team name} {season}"`,
  or generic `"Joukkueen ottelut"` before a team is resolved) — the same
  self-review pass flagged this as inconsistent with the other two pages
  for the identical underlying reason. Raised with the user during the
  PR-split rebuild and confirmed: now `"{team name} – {competition name}
  {season}"` (e.g. `"Arsenal FC – Bundesliga 2025/26"`), and just
  `"{competition name}"` for not-found/empty/error states before a team
  name is known — mirroring `/ottelut`'s `competitionName`-as-fallback
  pattern exactly.

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

Renamed for consistency with `MatchesControls` (`/ottelut`'s equivalent
composed selector) now that it composes three controls (`Kilpailu`,
`Kausi`, `Kierros`) instead of two. Same rename applied to its test file.

## Verification

- `npm run typecheck`, `npm run lint` clean.
- 226 unit tests passing, 100% statement/branch/function/line coverage.
- 12 integration tests passing against real Postgres/Redis.
- 12 e2e tests passing against a real dev server, real Postgres/Redis, and
  the live football-data.org API — including coverage for the competition
  picker and cross-competition checks (Bundesliga) on `/sarjataulukko` and
  `/ottelut`. `home.spec.ts` renamed `standings.spec.ts` and repointed
  from `/` to `/sarjataulukko` (the standings table moved),
  `matches.spec.ts`'s heading assertion updated for the new heading
  format, `team.spec.ts` repointed to click through from `/sarjataulukko`
  instead of `/`.
- Manual browser verification beyond the e2e suite: all 9 flags load with
  no broken images; `Kilpailu` dropdown lists all 9 competitions with
  correct names, including the accented `Campeonato Brasileiro Série A`;
  switching competitions updates the heading and URL correctly; the hidden
  `kilpailu` field correctly carries a non-default competition (Bundesliga)
  onto the team page.
