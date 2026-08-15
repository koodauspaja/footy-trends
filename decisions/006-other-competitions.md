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
