# 014 — Champions League: implementation decisions

Spec: `specs/014-champions-league.md`
Issue: #68

Champions League is the first cup-format competition in the app. Everything
here is built to be reused by the Finnish cups (#164) and by World Cup / Euro
(#165), so the decisions below lean towards "make the shape a parameter"
rather than "special-case `CL`".

## `format` on the competition, not a check on the code

`isCupCompetition("CL")` would have been one line. Instead `Competition`
carries `format: "league" | "cup"`, and every one of the nine existing entries
now says `"league"` explicitly.

The reason is that #165 adds two more cups and #164 adds three; each of those
would otherwise extend a growing list of codes in a conditional. An unknown
code answers `"league"` — the path that has always existed — so a malformed
`kilpailu` cannot route a request into the newer cup rendering, even though
`parseCompetitionParam` already rejects it first.

## The shape comes from the data, never from the season number

Verified live on 2026-08-26: our plan reaches exactly three CL seasons, and
they do not share a format.

| Season | Table phase | Knockout |
|---|---|---|
| 2023 | `GROUP_STAGE`, groups A–H | `LAST_16` → `FINAL` |
| 2024 | `LEAGUE_STAGE`, 36 teams, matchdays 1–8 | `PLAYOFFS` → `LAST_16` → `FINAL` |
| 2025 | as 2024 | in progress |

`resolvePhaseShape` looks for `GROUP_STAGE` and then `LEAGUE_STAGE` in the
season's own matches. A hardcoded `seasonId >= 2024` cutoff would have been
shorter and would need editing the next time UEFA changes the format — and
would be silently wrong until someone noticed. The format has already changed
twice in the three seasons we can see.

## `fullTime` includes the penalty shootout

This is the one that would have shipped as a bug.

`score.fullTime` for Liverpool–Paris Saint-Germain (`LAST_16`, 2024/25) reads
**1–5**. The tie was 1–1; PSG won 4–1 on penalties. `fullTime` is
`regularTime + extraTime + penalties`, and six matches across 2023–2024 are
affected. A naive aggregate over `fullTime` reports several ties wrongly, and
the error is invisible unless you already know the result.

So `legScore` sums `regularTime + extraTime` and never `fullTime`. When
`regularTime` is absent the match went to neither extra time nor penalties,
and `fullTime` *is* the normal-time score — that is the fallback.

`homeGoals`/`awayGoals` deliberately stay `fullTime`. Changing them would move
every league competition's standings, which this feature must not touch.

## The breakdown is stored, not recomputed

Resolved during spec review (Open Question 1). `matches` gains six nullable
integer columns alongside `stage` and `group_name`.

The alternative — computing the bracket from the cached provider response —
was smaller, but it would blank the bracket exactly when the provider is
unreachable and the DB is serving as the fallback, while the standings beside
it still rendered. Every new column is nullable and unset for the nine
leagues, so the migration needs no backfill.

## Two divergences from the spec, both deliberate

### `buildCupPhaseStandings` lives in its own module

The spec put group-phase standings in `standings-service.ts`. It is a pure
function, and `standings-service` imports the database at module scope, so
testing it there would have meant mocking Drizzle to exercise arithmetic. It
is in `src/lib/cup-standings.ts` instead, and `toFinishedMatches` moved from
`standings-service.ts` to `standings.ts` so both callers apply the same
finished-match rule rather than duplicating it.

### `Ratkeamatta` is not implemented

The spec called for `Ratkeamatta` where a tie's participants are not yet
known. That string is unreachable: `normalizeMatch` drops any match without
both team ids and names, so a to-be-determined fixture never becomes a row.
Adding a string that can never render would be worse than omitting it. A stage
with no known ties shows the empty state instead.

## Knockout rounds are derived, not listed

`buildBracket` first iterated a hardcoded `KNOCKOUT_STAGES`. Sourcery pointed
out that the match list's `Vaihe` options are derived from the season's own
matches, so the two would disagree the moment the provider introduced a stage:
visible in the dropdown, absent from the standings page. That is exactly how
`Pudotuspelikarsinta` came to be invisible in the first place, one refactor on.

A knockout round is now defined by what it is not — anything that is not
`LEAGUE_STAGE` or `GROUP_STAGE` — so the list cannot fall behind the data. An
unrecognised stage sorts last, because `STAGE_ORDER` cannot rank a name it has
never seen; visible-but-last is the deliberate trade against being dropped.

## Group headings keep the Finnish noun

`getGroupName` originally passed a non-`GROUP_*` value through verbatim, by
analogy with `getStageName`. The analogy was wrong: a stage name is a whole
translated phrase, whereas a group heading is the Finnish noun *lohko* plus an
identifier. Passing the raw value through therefore produced a heading with no
Finnish in it at all, against the project's hard rule. It now always reads
`Lohko X` — `Lohko 1` for an unrecognised value rather than a bare `1`.

## `ContextNotices`

The invalid-`kilpailu` and invalid-`kausi` banners were copy-pasted into both
pages when each grew a league and a cup branch — 21 duplicated lines, which
Sonar flagged. They live in `src/components/context-notices.tsx` now; four
render paths share one copy.

## Sonar and complexity

Sonar flagged `buildTie` and `buildBracket` at cognitive complexity 17 and 19
against a limit of 15. Both were split rather than exempted: `accumulate` walks
the legs, `shootoutScore` orients the shootout, `pairLegs` groups by team pair
and `buildRound` builds one round's ties. `TABLE_PRODUCING_STAGES` became a
`Set`, and the shootout guard an optional chain.

## Page sections are awaited functions, not async components

`CupStandingsPage`/`LeagueStandingsPage` began as async components rendered as
JSX. React cannot render an async function component outside the full RSC
pipeline, so every page test failed with "is an async Client Component". They
are plain async functions the route awaits and returns — same structure, no
test-only shim.

## Bracket rendering: two shapes, and why

The knockout phase renders in two parts, revised during review after the first
version proved to hide a whole round.

**Everything before the quarter-finals is listed** as a table of resolved ties.
**Quarter-finals onward are drawn** as a left-to-right tree: one column per
round, cards of a fixed width, later rounds vertically centred against the pair
that feeds them, with decorative connector stubs (`aria-hidden`, since the
round headings already carry the structure).

The split is a readability limit rather than a preference. `LAST_16` is eight
ties across and `LAST_32` sixteen; no tree survives either on a phone. From the
quarter-finals it is three columns and shows the one thing a list cannot — who
plays whom next.

The first version drew nothing and listed only the last three rounds, which
meant `Pudotuspelikarsinta` existed solely as an option in the match list's
`Vaihe` dropdown — invisible on the standings page. Every knockout round the
season has is now on the page.

`THIRD_PLACE` is listed rather than drawn wherever it occurs: it hangs off the
semi-finals and does not feed the final, so it has no position in the tree.

### Mobile

Columns are fixed-width and the row scrolls inside its own `overflow-x-auto`
container; the page itself never scrolls horizontally, verified at 375px. The
first attempt used `flex-1` inside a `min-w-[640px]` row, which squeezed the
columns until long club names wrapped mid-card and pushed the score out of the
box. Fixed widths with `min-w-0` on the name and `shrink-0` on the score keep
every card identical.

### Scores in the tree

Each side shows its aggregate, and its shootout score in parentheses after it
when the tie went to penalties — `Real Madrid CF 4 (4)` over
`Manchester City FC 4 (3)`, the usual football convention. `(ja)` is jatkoaika,
`(rp)` rangaistuspotkut; a tie settled in normal time carries no label.

That required the tie to expose penalties **oriented to the tie's own home
side**, not the deciding leg's: the second leg is frequently the one that goes
to penalties, and its `penaltiesHome` then belongs to the tie's *away* team.
`shootoutScore` does that conversion once and both the winner logic and the
display read the result.

The decision is derived from the stored breakdown rather than the provider's
`duration`, which is therefore not stored.

A leg's displayed score is the same `regularTime + extraTime` the aggregate is
built from, not the provider's `fullTime`. Sourcery caught this after the first
fix round: the tie header was already correct, but the legs beneath it still
printed `fullTime`, so the 2023/24 quarter-final showed
`Manchester City 4-5 Real Madrid` under an aggregate of `4-4 (rp)` — a leg
score contradicting the tie it belonged to. The shootout is now stated
separately, as `1-1 (rp 3-4)`.

Two defensive branches were removed rather than left untested: the pairings
map is typed as a non-empty tuple, and the first leg is found with a seedless
`reduce` instead of an index access with a fallback. Both existed only to
satisfy the compiler and could not be reached.

## Stage naming

`LAST_16` is `Neljännesvälierät` — Finnish names knockout rounds by fraction,
so the round of 16 is a quarter of a quarter-final. `PLAYOFFS` is
`Pudotuspelikarsinta`, confirmed in chat; UEFA's own Finnish materials are
inconsistent there.

`LAST_32` (`Kahdeksannesvälierät`) and `THIRD_PLACE` (`Pronssiottelu`) occur in
no CL season and were initially left unmapped, on the reasoning that an
unmapped stage falls through to its raw value and keeps a format change
visible. Sourcery pointed out that this collides with the project's hard rule
that all user-facing strings are Finnish: the World Cup has both stages, so
#165 would have shipped a raw `THIRD_PLACE` to a Finnish reader. They are named
now. The passthrough remains, but only as a last resort for a stage nobody has
seen — showing the raw code still beats inventing a wrong Finnish label.
`Pronssiottelu` is worth revisiting in #164, where TASO's own data uses
`Pikkufinaali` for the same fixture.

## Stage order is progression, not provider order

The spec first said the `Vaihe` selector lists stages "in provider order". The
implementation sorts by an explicit `STAGE_ORDER` instead, and the spec has
been corrected to match rather than the other way round.

The two orders coincide in every response checked, so following the provider
buys nothing and costs determinism: a reordered response would silently
reshuffle the selector. An unrecognised stage sorts last, so it stays visible.
Sourcery flagged the mismatch as spec drift, which it was — in the spec.

## Verification

Checked against the running app, not only against tests:

- CL 2024/25 renders one `Liigavaihe` table with 36 rows, Liverpool top.
- The bracket reproduces the real tournament: Arsenal 5–1 Real Madrid,
  Inter 4–3 Bayern, PSG 5–4 Aston Villa, Barcelona 5–3 Dortmund;
  PSG 3–1 Arsenal, Inter 7–6 Barcelona `(ja)`; final PSG 5–0 Inter.
- CL 2023/24 renders eight `Lohko A`–`Lohko H` tables of four rows each.
- `kausi=2022` falls back with the Finnish notice and makes no provider call —
  no 403 appears in the server log.
- `/ulkomaat/sarjataulukko?kilpailu=PL` still has its `Kierros` selector and
  no cup sections.

Unit tests are at **100% statements, branches, functions and lines**
(673 tests); integration 21; the five new Playwright specs pass locally.

## Moved from comments, 2026-10-05

Cut from `src/lib/cup-bracket.ts` at `55a14fc` by #531.

- **`BracketLeg.homeGoals`, `legScore`.** Liverpool "1-5" Paris Saint-Germain
  (LAST_16, 2024/25) was 0-1, penalties 1-4; `fullTime` beside a 1-1 (rp)
  aggregate contradicts the tie.

Cut from `src/lib/standings-service.ts` at `55a14fc` by #531.

- **`getCupSeason`.** The tables, stage list and bracket ask about one season,
  which the provider returns in one response.

## Moved from comments, 2026-10-06

Cut from `src/db/schema.ts` at `a86c1cb` by #531.

- **`matches.stage`.** Null for all nine league competitions, so the migration
  needed no backfill.
- **`regular_time_*`, `extra_time_*`, `penalties_*`.** `fullTime` includes the
  shoot-out and is therefore useless for aggregating a two-legged tie: see
  `ProviderMatch` in `football-data.ts`.

Cut from `src/lib/cup-stages.ts` at `a86c1cb` by #531.

- **`STAGE_NAMES`.** Finnish names a knockout round by fraction, a quarter of
  a quarter-final, and not by transliterating "last 16". `LAST_32` and
  `THIRD_PLACE` occur in no Champions League season but were named from the
  start, because the World Cup has both and leaving them out would put a raw
  `THIRD_PLACE` in front of a Finnish reader. The passthrough in
  `getStageName` is the last resort for a stage no one has seen yet.
- **`BRACKET_STAGES`.** `LAST_16` is eight ties across and `LAST_32` sixteen.
- **`listKnockoutStages`.** Not a hardcoded list of stage names:
  `listSeasonStages` derives the match list's `Vaihe` options from the
  season's own matches, so a fixed list would let a stage the provider adds
  appear in the dropdown and vanish from the standings page, which is how
  `Pudotuspelikarsinta` came to be invisible in the first version.
- **`getGroupName`.** A group is always a *lohko* whatever the provider calls
  it. Unlike `getStageName` there is nothing to translate beyond the noun, so
  no value reaches a heading without it: a raw provider token alone would be
  a user-facing string that is not Finnish.
- **`listSeasonStages`.** The provider's array order and the progression
  coincide in every response checked, so relying on the provider buys nothing
  and costs determinism: a reordered response would reshuffle the `Vaihe`
  selector.
- **`PhaseShape`.** The Champions League ran eight groups in 2023/24 and a
  single 36-team league phase from 2024/25; the format changed twice in three
  seasons. A hardcoded cutoff would need editing the next time, and be wrong
  until someone noticed.
- **`parseStageParam`.** An unvalidated value must never reach a cache key or
  a query, the rule `parseCompetitionParam` and `parseSeasonParam` enforce.
- **`resolveCurrentStage`.** The cup analogue of `resolveCurrentRound`, and
  separate from it: a cup's `matchday` is a leg number, so the round logic
  cannot be reused.

Cut from `src/lib/football-data.ts` at `a86c1cb` by #531.

- **The score breakdown in `football-data.ts`.** `fullTime` includes a penalty
  shoot-out: Liverpool "1-5" PSG (LAST_16, 2024/25) is really 0-1 with
  penalties 1-4, which is why the breakdown is carried through and not
  dropped. The provider omits it for every league match and any cup match
  decided in normal time.

Cut from `src/lib/competitions.ts` at `94397a8` by #531.

- **`CompetitionFormat`.** The discriminator lives in the registry and is not
  derived from the code, so a second cup needs a registry entry and not a new
  branch. The Champions League joined as the first cup, which is why every
  entry carries an explicit `format`.
- **`getCompetitionFormat`.** The league path is the one that has always
  existed, so a bad `kilpailu` value cannot route a request into the newer cup
  rendering. `parseCompetitionParam` rejects unknown codes before this is
  reached in practice.

Cut from `src/lib/standings.ts` at `ef7eb13` by #531.

- **`toFinishedMatches`.** Excluding an unfinished match that carries goals
  is defensive; the provider should never do this. It lives in `standings.ts`
  and not in `standings-service` so the cup phase tables can apply the same
  rule without importing the database.

Cut from `src/components/cup-bracket.tsx` at `dc74e3e` by #531.

- **`formatLeg`.** `formatMatchResult` alone would print 0-1 for a shootout
  leg and lose the fact that it went to penalties.
- **The split in `CupBracket`.** A readability limit, not a preference.
  `LAST_16` is eight ties across and `LAST_32` sixteen, which no tree
  survives on a phone; from the quarter-finals the tree is three columns and
  shows what a list cannot: who plays whom next.

Cut from `src/lib/cup-standings.ts` at `ef99862` by #531.

- **`cup-standings.ts`.** Database-free so it stays testable without
  mocking the DB.
- **`buildCupPhaseStandings`.** Sorting by group and not by the order the
  provider happened to return matches in: the two coincide today, and
  sorting makes the page deterministic if that ever stops being true. A
  team's knockout results cannot leak into the table it earned its place
  in.

Cut from `src/components/context-notices.tsx` at `48ebab4` by #531.

- **`ContextNotices`.** Both the standings and match-list pages branch into
  a league shape and a cup shape, and all four render exactly these two
  notices: four copies of the same block if it lives in the pages.

Cut from `src/components/cup-matches-controls.tsx` at `48ebab4` by #531.

- **`CupMatchesControls`.** The cup counterpart to `MatchesControls`, which
  selects a round. Dropping `kierros` means switching between a league and a
  cup cannot leave a stale round in the query string.
- **The stage across a season change.** 2023/24 had a group stage and
  2024/25 a league phase.

Cut from `src/components/cup-standings-controls.tsx` at `48ebab4` by #531.

- **`CupStandingsControls`.** A cup page has no round selector: its knockout
  matchdays are leg numbers and not rounds, and the phase tables it shows
  are always the phase's full table. `Vaihe` lives on the match list, so the
  two controls never sit side by side answering the same question. Clearing
  `kierros` means a round carried over from a league competition cannot
  survive the switch into a cup.

Cut from `src/components/stage-select.tsx` at `48ebab4` by #531.

- **`StageSelect`.** `RoundSelect` cannot be reused: a cup's `matchday` is a
  leg number (1 or 2, and 0 for a final), not a round, so there is no 1..n
  range to list.
