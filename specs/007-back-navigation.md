# 007 — Back navigation between pages

> **Routes and names moved by `specs/012-finnish-urls-english-code.md`
> (#142).** The football-data.org pages are now under `/ulkomaat/` —
> `/ulkomaat/sarjataulukko`, `/ulkomaat/ottelut`, `/ulkomaat/joukkue/:id`
> — and the old top-level paths redirect there permanently. English paths
> such as `/standings` no longer serve a page; they redirect to their
> Finnish equivalent. In code, `kotimaa`/`ulkomaat` are now
> `domestic`/`foreign`. Paths named below refer to the pre-012 structure.


## Summary
Every link in the app currently only goes forward — the picker links to standings, standings links to matches and team pages, matches links to team pages — and nothing ever links back, so the only way to return to a page you came from is the browser's back button. `/joukkue/:id` has zero outbound links at all today. Adds a persistent site-wide header (home always reachable) plus a "back to standings" link on the two pages that currently dead-end, and fixes an existing gap where the round selected on standings doesn't survive navigating to the matches list and back.

## Scope

### In scope
- A persistent header, rendered once in the root layout so it appears on every page (current and future): one link, **"Etusivu"**, to `/`.
- `/ottelut` gains a link back to `/sarjataulukko` for the current competition and season.
- `/joukkue/:id` gains a link back to `/sarjataulukko` for the current competition and season. Today this page has zero outbound links at all — it's a dead end.
- The back link from `/ottelut` carries the currently-selected `kierros`, if any, so returning to standings shows the same round you were viewing matches for, not the unfiltered full season.
- Fixes the existing "Kaikki ottelut" link on `/sarjataulukko` to carry `kierros` forward the same way — this gap exists today independent of anything new in this spec (selecting round 5 on standings, then clicking "Kaikki ottelut", already loses the round selection).

### Out of scope
- A competition-switching `Kilpailu` selector on `/ottelut` or `/joukkue/:id`. Meaningful mainly once a team can appear in more than one in-scope competition — true of Champions League–style cup competitions but not of the 9 domestic leagues spec 006 covers, which don't share teams with each other. Tracked against #68 (cup/knockout competitions), not built here. Nothing in this spec's design blocks adding it later — every route is already parameterized by `kilpailu`, so a future "this team also plays in X" link is just another link with a different `kilpailu` value.
- A standalone "back to picker" link on `/sarjataulukko` itself — superseded by the persistent header, which already puts a home link on every page including this one.
- Full breadcrumb trails showing the entire path (e.g. "Kilpailut > Bundesliga > Ottelut"). One "back to standings" link per dead-end page, plus the always-present header, covers the actual gap without needing to track or render multi-level history.
- Preserving the literal referring page for `/joukkue/:id`, which is reachable from both `/sarjataulukko` and `/ottelut`. Its back link always targets `/sarjataulukko` (the natural hub for a competition), not "wherever you actually came from."
- Any change to the browser's native back button behavior.
- Header branding/logo/visual design beyond a plain text link — functional only.

## UX / UI (Finnish strings)
- Header (every page): link text **"Etusivu"**, `href="/"`.
- `/ottelut`: a new link near the top of the page, text **"Sarjataulukkoon"**, `href="/sarjataulukko?kilpailu={code}&kausi={seasonId}"`, plus `&kierros={round}` when a specific round is currently shown.
- `/joukkue/:id`: a new link near the top of the page, text **"Sarjataulukkoon"**, `href="/sarjataulukko?kilpailu={code}&kausi={seasonId}"`.
- `/sarjataulukko`: existing "Kaikki ottelut" link gains `&kierros={round}` when a specific round is currently selected (today it only carries `kilpailu`/`kausi`).

## API & Data
No new endpoints, no new data fetching. Every page already resolves `competitionCode`, `seasonId`, and (where relevant) the selected round for its existing links/selectors; the new and fixed links reuse those same values. No caching implications.

## Edge Cases
- Invalid or absent `kilpailu`/`kausi` on `/ottelut` or `/joukkue/:id`: the back link uses the already-resolved (fallback-applied) `competitionCode`/`seasonId` — identical to how the existing team-name links on those pages already behave.
- `/joukkue/:id` with an unknown or non-numeric team id: `competitionCode` is resolved independently of whether the team itself is found, so the back link still renders in the not-found state.
- `/ottelut` in the empty/error result state (no resolved round): the back link omits `kierros` and falls back to the whole-season standings link, same as the "Kaikki ottelut" link already does today when no round is selected.
- `/sarjataulukko` with `kierros` set to "koko kausi" (no specific round, i.e. `selectedRound === undefined`): "Kaikki ottelut" carries no `kierros`, unchanged from today's behavior.
- The header's home link is a plain, unconditional `<Link href="/">` — no dynamic state, so no edge cases of its own.

## Performance & Limits
None — no new requests. One new always-rendered header component; two new links; two existing links gain one extra query param each.

## Security & Secrets
None — no new env vars, no secrets involved.

## Acceptance Criteria
- [ ] Every page (`/`, `/sarjataulukko`, `/ottelut`, `/joukkue/:id`) shows an "Etusivu" link to `/` in a persistent header.
- [ ] `/ottelut?kilpailu={code}&kausi={season}&kierros={round}` shows a "Sarjataulukkoon" link to `/sarjataulukko?kilpailu={code}&kausi={season}&kierros={round}`.
- [ ] `/ottelut` without a specific round shows "Sarjataulukkoon" linking to `/sarjataulukko?kilpailu={code}&kausi={season}` (no `kierros`).
- [ ] `/joukkue/:id?kilpailu={code}&kausi={season}` shows a "Sarjataulukkoon" link to `/sarjataulukko?kilpailu={code}&kausi={season}`, including in the not-found state.
- [ ] `/sarjataulukko?kilpailu={code}&kausi={season}&kierros={round}` shows "Kaikki ottelut" linking to `/ottelut?kilpailu={code}&kausi={season}&kierros={round}`.
- [ ] All links use each page's already-resolved (fallback-applied) competition/season/round, not raw/possibly-invalid query params.

## Tests Required
- `tests/unit/components/site-header.test.tsx` (new): renders the "Etusivu" link with `href="/"`.
- `tests/unit/app/standings/page.test.tsx`: "Kaikki ottelut" carries `kierros` when a round is selected, omits it otherwise (extends existing link tests).
- `tests/unit/app/matches/page.test.tsx`: "Sarjataulukkoon" link's `href`, with and without a resolved round, and for an invalid `kilpailu`/`kausi` fallback case.
- `tests/unit/app/team/[id]/page.test.tsx`: "Sarjataulukkoon" link's `href`, including in the not-found state.
- `tests/e2e/standings.spec.ts`, `tests/e2e/matches.spec.ts`, `tests/e2e/team.spec.ts`: click-through assertions confirming the new/fixed links actually navigate correctly, plus one assertion that "Etusivu" is present and works from at least one non-home page.

## Files To Update
- `src/components/site-header.tsx` (new)
- `src/app/layout.tsx`
- `src/app/standings/page.tsx`
- `src/app/matches/page.tsx`
- `src/app/team/[id]/page.tsx`
- Corresponding test files listed above
- `decisions/007-back-navigation.md` (written during implementation)

## Open Questions
- None. The competition-switcher deferral and its non-blocking rationale are already resolved above, in Out of scope.
