# 060 — Elo variants: decisions

Implementation notes for `specs/060-elo-variants.md` (#346). The spec says what
the two variants compute and where they are shown; this says how, and where the
build had to decide something the spec did not. It builds on decisions/053 (the
rating replay) and decisions/059 (cup ties predicted from league state).

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `src/lib/elo-variants.ts`, pure: the constants, the two states, the two predictions and `replayVariants` | As decisions/053 for `elo.ts`: every rule is unit-tested without a database, and the services only read and write |
| One replay loop, not a second | `replayElo` gains an optional third callback, `onPlayed`, called with each kickoff's league matches after their updates are applied; `replayVariants` learns from it and predicts from `onPredict` | A second loop over the matches would have to repeat the kickoff grouping, the order, the placeholder filter and the cup rule, and could drift from them, as a parallel path did on #630. One loop keeps the variants on exactly the matches and ratings `elo-v1` has. The backtest runs that loop once more per provider for the variants, the two more replays the spec's Performance section allows, each milliseconds |
| `elo-v1` unchanged | `replayElo`'s ratings and `onPredict` calls are what they were; `onPlayed` only reads. `threeWay` now calls `splitThreeWay`, the same arithmetic | AC 3. A test runs the replay with and without `onPlayed` and asserts identical ratings and predictions |
| The variants' ratings | `elo-v1`'s, read from the replay; neither variant changes a rating | S2 for form ("the rating itself unchanged"), S15 for the home advantage |
| The form term's expectation | Each side's score above `elo-v1`'s expectation at kickoff, the flat 60 included | S2 and API & Data: "each `S − E` as Elo computed it at kickoff" |
| The home advantage's expectation | The variant's own, with the team's home advantage in place of 60, through `expectedHome`, which takes the advantage as an optional third argument | S15. One logistic formula, not a copy of it with another constant |
| Which matches teach the variants | The matches `elo-v1` learns from: every rated league and Champions League match, never a predicted cup tie | S11: "a cup tie moves no rating, form or home advantage". The form window and the home advantage follow the ratings' own set, so neither knows a match the ratings do not |
| A season | `ratingFor`'s own rule, for both states: a match of the team's stored season or an older one is the same season; a later one starts the form afresh and regresses the home advantage a third towards 60; the state then stores the match's season, as the ratings do | S4, "as specs/053 S3". The variants read `elo-v1`'s ratings, so they must agree with them on what a new season is, a back-dated match included |
| One kickoff | Every change at a kickoff is worked out from the state before any of its matches, then applied; a team in two matches at one kickoff (a stored duplicate) keeps both | decisions/053's rule for the ratings, the same for the variants' state |
| The clamp | Applied after a kickoff's changes are added up | S3's bounds hold on what is stored; a team cannot pass 150 by two home matches at one kickoff |
| An upcoming match | `predictUpcomingVariants`: the current ratings with `ratingFor`'s season regression, and the state as the replay left it | The same as `predictElo` for `elo-v1` |
| The live run | `eloBySource` replays each provider once and returns the ratings and the state; `elo-v1`'s row and the two variants' come from that one replay | One replay per provider, as before. A failed history read writes none of the three, and is reported as `elo ratings`, as it is today |
| The backtest | `eloVariantBacktestRows`, beside `eloBacktestRows`: one replay per provider writes both variants' rows, at the draw share of the baseline backtest's row for that match | decisions/053's rule for `elo-v1`'s draw share. The rows are of exactly the matches `elo-v1`'s backtest has |
| The order of models | `QUALITY_MODELS`: the baseline, Elo, `Elo + vire`, `Elo + kotietu`, Poisson | S10: "after `Elo`" |
| Lines | `LineSeries` gains `longDashed` (`12 4`) and `dashDotDotted` (`6 4 2 4 2 4`), each with its `data-` attribute; `Elo + vire` long-dashed and `Elo + kotietu` dash-dot-dotted | S14. One flag per style, as the chart's other styles are |
| Tables at 375 px | The two tables with a column per model, `Kilpailuittain` and the scores by season, each in its own `overflow-x-auto` box | S6 names `Kilpailuittain`; the scores by season gets the same five columns, so the same box |
| The intro | `Kuinka usein perustaso, Elo, Elo + vire, Elo + kotietu ja Poisson ovat ennustaneet …` | The sentence named the three models; it names the five |
| The predictions suite's time | `tests/integration/predictions.test.ts` gives both its describe blocks 30 s | The backtest and the hourly run's backtest step read every finished match stored, and the test database also holds what end-to-end runs store: about 9 000 football-data and 3 600 TASO matches on 2026-10-14. On that database the idempotence test took 5,3 s without the variants' rows and 5,5 s with them, past vitest's 5 s, and it had timed out the same way earlier that day. CI starts from an empty database. The repository's other slow-by-design test gives itself a timeout the same way (`staging-sleep-settings.test.ts`) |
| The cache | Unchanged: `quality:v3:*` | S13. A report cached before the release has three models and expires within 15 minutes; it is not wrong, only short of the two, as decisions/059 accepted for the cups |

## The release step

`npm run predictions -- backtest` once in each environment after the release
deploys (S7), as `docs/infrastructure.md` asks after a release that adds a
model. In production the next hourly run would otherwise compute both
variants' whole history itself (its backtest step writes every missing row);
staging has nothing scheduled, so there it is the only way. Until the rows
exist, `/ennusteet`'s backtest tab, which judges only the matches every model
predicted, shows its empty state. Must reach the release notes.

## The author's review before the first push

The pass in `skills/self-review.md` and the `code-review` skill, run on the
branch before it was pushed. What they changed:

| Finding | Outcome |
|---|---|
| `onPredict`'s `predict` read the state when called, not at the match | Fixed: the two expectations are worked out before the callback is called. Mutation 29 |
| An upcoming match spread its whole candidate into the fixture | Fixed: the three fields it needs are picked |
| The form's season rule was `!==` where `ratingFor`'s is `<=` | Fixed, as the row "A season" says. Mutation 30 |
| `homeExpected` copied the logistic formula | Fixed: `expectedHome` takes the advantage. Mutation 31 |
| The replay's callback repeated the prediction step | Fixed: `expectations` and `splitBoth`, shared with an upcoming match |
| The cup-tie test asserted inside a callback that might not run | Fixed: collected, then asserted outside, the value required to be a number |
| The 375 px test did not show that anything scrolls | Fixed: it asserts each box's content is wider than the box |
| Four doc comments ran to four lines | Trimmed to three |
| The run's and the backtest's comments named Elo and Poisson only | Fixed: they name the three Elo models |
| The backtest replays each provider three times | Not changed: the spec allows the two more replays, milliseconds each |
| The hourly run builds every variant backtest row and filters the written ones | Not changed: `elo-v1`'s rows are built and filtered the same way; Poisson's `wanted` exists because its fit costs a day's work, a replay does not |
| A shared helper for the ten-field row | Not changed: six existing copies; a refactor of them is not this feature's |
| The dash-dot-dot legend sample beside Poisson's dash-dot | Not changed: looked at on the page at 375 px in both schemes, the two read apart (a dash and two dots, a dash and one) |

## What the tests prove, and how

- **By hand**: the form term, its window and its season; the home advantage's
  move, clamp, regression and two matches at one kickoff; each variant's
  prediction in a replay, of an upcoming match, and in the backtest against
  Postgres, the stored 5–4 shoot-out a draw for both (`tests/unit/lib/elo-variants.test.ts`,
  `tests/integration/predictions.test.ts`).
- **`elo-v1` unchanged**: `replayElo` with and without `onPlayed` gives the same
  ratings, history and predictions; `elo.test.ts`'s earlier tests are as they were.
- **End to end**: `/ennusteet` with five models seeded, every figure naming all
  five, and at 375 px the page itself not scrolling sideways while the two
  five-column tables sit in boxes that do.
- **Every mutation below was caught**, each applied alone and restored from a
  commit, and each by the test written for it, read from the failing test's
  name:

| # | Mutation |
|---|---|
| 1 | The form window six long |
| 2 | Form carried into a new season |
| 3 | The away side's form given the home side's surprise |
| 4 | The home advantage moved by `elo-v1`'s expectation |
| 5 | No clamp |
| 6 | No regression of a home advantage |
| 7 | The away side's advantage moved |
| 8 | A second home match at one kickoff dropping the first's change |
| 9 | Each match learned before the next at one kickoff |
| 10 | A cup tie learned from |
| 11 | The two predictions swapped |
| 12 | A variant backtest row without the baseline's draw share |
| 13 | The variant rows under each other's names |
| 14 | Missing variant backtest rows never written |
| 15 | The whole backtest without the variants |
| 16 | The hourly run without variant live rows |
| 17 | Variant live rows without a draw share |
| 18 | An upcoming match not regressed into its season |
| 19 | An upcoming placeholder side predicted |
| 20 | The variants in the other order on the page |
| 21 | The labels swapped |
| 22 | The line styles swapped |
| 23 | A long dash drawn as a dash |
| 24 | No marker for a dash-dot-dotted line |
| 25 | The scores by season not in a scrolling box |
| 26 | `Kilpailuittain` not in a scrolling box |
| 27 | The intro naming three models |
| 28 | The form term against the variant's own form-weighted expectation |
| 29 | The variants' predictions worked out when asked, not at the match |
| 30 | An older season's match resetting the form |
| 31 | `expectedHome` ignoring a home advantage of its own |

- **One first survived and was a wrong mutation**: number 12 replaced the draw
  share after its guard, which changed nothing; with the guard removed it was
  caught.
- **Against Postgres, by accident**: timing the idempotence test with the
  variants' backtest rows switched off failed it on their assertions.
