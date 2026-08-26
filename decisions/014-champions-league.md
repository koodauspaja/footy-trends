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

## The `LAST_16` acceptance criterion is verified by test, not on the page

Acceptance criterion 7 names the Liverpool–PSG aggregate, but `LAST_16` is
explicitly *not* in the bracket — it renders as a match list, per the spec's
own scope. `buildBracket` takes the stages as a parameter, so the criterion is
verified in `tests/unit/lib/cup-bracket.test.ts` against that exact fixture,
which is what the criterion is actually about: the aggregation being right.

## Page sections are awaited functions, not async components

`CupStandingsPage`/`LeagueStandingsPage` began as async components rendered as
JSX. React cannot render an async function component outside the full RSC
pipeline, so every page test failed with "is an async Client Component". They
are plain async functions the route awaits and returns — same structure, no
test-only shim.

## Bracket rendering

Rendered as one table per round rather than a drawn tree. The rounds it covers
are at most eight ties wide, and a table stays readable on a phone where a
tree does not. `(ja)` is jatkoaika, `(rp)` rangaistuspotkut; a tie settled in
normal time gets no suffix. The decision is derived from the stored breakdown
rather than the provider's `duration`, which is therefore not stored.

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
