# 060 — Elo variants: decisions

Implementation notes for `specs/060-elo-variants.md` (#346). The spec says what
the two variants compute and where they are shown; this says how, and where the
build had to decide something the spec did not. It builds on decisions/053 (the
rating replay) and decisions/059 (cup ties predicted from league state).

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `src/lib/elo-variants.ts`, pure: the constants, the two states, the two predictions and `replayVariants` | As decisions/053 for `elo.ts`: every rule is unit-tested without a database, and the services only read and write |
| One replay, not a second | `replayElo` gains an optional third callback, `onPlayed`, called with each kickoff's league matches after their updates are applied; `replayVariants` learns from it and predicts from `onPredict` | A second loop over the matches would have to repeat the kickoff grouping, the order, the placeholder filter and the cup rule, and could drift from them, as a parallel path did on #630. One replay keeps the variants on exactly the matches and ratings `elo-v1` has |
| `elo-v1` unchanged | `replayElo`'s ratings and `onPredict` calls are what they were; `onPlayed` only reads. `threeWay` now calls `splitThreeWay`, the same arithmetic | AC 3. A test runs the replay with and without `onPlayed` and asserts identical ratings and predictions |
| The variants' ratings | `elo-v1`'s, read from the replay; neither variant changes a rating | S2 for form ("the rating itself unchanged"), S15 for the home advantage |
| The form term's expectation | Each side's score above `elo-v1`'s expectation at kickoff, the flat 60 included | S2 and API & Data: "each `S − E` as Elo computed it at kickoff" |
| The home advantage's expectation | The variant's own, with the team's home advantage in place of 60 | S15 |
| Which matches teach the variants | The matches `elo-v1` learns from: every rated league and Champions League match, never a predicted cup tie | S11: "a cup tie moves no rating, form or home advantage". The form window and the home advantage follow the ratings' own set, so neither knows a match the ratings do not |
| A season | A team's form is that of its latest season played, and counts nothing at its first match of another; its home advantage is regressed a third towards 60 at its first home match of a later season | S4, as `ratingFor` does for a rating |
| One kickoff | Every change at a kickoff is worked out from the state before any of its matches, then applied; a team in two matches at one kickoff (a stored duplicate) keeps both | decisions/053's rule for the ratings, the same for the variants' state |
| The clamp | Applied after a kickoff's changes are added up | S3's bounds hold on what is stored; a team cannot pass 150 by two home matches at one kickoff |
| An upcoming match | `predictUpcomingVariants`: the current ratings with `ratingFor`'s season regression, and the state as the replay left it | The same as `predictElo` for `elo-v1` |
| The live run | `eloBySource` replays each provider once and returns the ratings and the state; `elo-v1`'s row and the two variants' come from that one replay | One replay per provider, as before. A failed history read writes none of the three, and is reported as `elo ratings`, as it is today |
| The backtest | `eloVariantBacktestRows`, beside `eloBacktestRows`: one replay per provider writes both variants' rows, at the draw share of the baseline backtest's row for that match | decisions/053's rule for `elo-v1`'s draw share. The rows are of exactly the matches `elo-v1`'s backtest has |
| The order of models | `QUALITY_MODELS`: the baseline, Elo, `Elo + vire`, `Elo + kotietu`, Poisson | S10: "after `Elo`" |
| Lines | `LineSeries` gains `longDashed` (`12 4`) and `dashDotDotted` (`6 4 2 4 2 4`), each with its `data-` attribute; `Elo + vire` long-dashed and `Elo + kotietu` dash-dot-dotted | S14. One flag per style, as the chart's other styles are |
| Tables at 375 px | The two tables with a column per model, `Kilpailuittain` and the scores by season, each in its own `overflow-x-auto` box | S6 names `Kilpailuittain`; the scores by season gets the same five columns, so the same box |
| The intro | `Kuinka usein perustaso, Elo, Elo + vire, Elo + kotietu ja Poisson ovat ennustaneet …` | The sentence named the three models; it names the five |
| The cache | Unchanged: `quality:v3:*` | S13. A report cached before the release has three models and expires within 15 minutes; it is not wrong, only short of the two, as decisions/059 accepted for the cups |

## The release step

`npm run predictions -- backtest` once in each environment after the release
deploys (S7), as `docs/infrastructure.md` asks after a release that adds a
model. In production the next hourly run would otherwise compute both
variants' whole history itself (its backtest step writes every missing row);
staging has nothing scheduled, so there it is the only way. Until the rows
exist, `/ennusteet`'s backtest tab, which judges only the matches every model
predicted, shows its empty state. Must reach the release notes.

## What the tests prove, and how

To be filled in as the tests are written and mutation-checked.
