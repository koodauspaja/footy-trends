# 055 — Poisson goal model: decisions

Implementation notes for `specs/055-poisson-goal-model.md` (#345, #348). The
spec says what is fitted and shown; this says how, and where the
implementation had to decide something the spec did not.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the rules live | `poisson.ts`, pure: the constants, the fit, the grid, the three outcomes, the most likely score, the draw factor, the prediction and the replay | Every rule is unit-tested without a database; `poisson-service.ts` only reads and caches, and the log's service only reads and writes. |
| One function of the day | `fitPoisson(matches, day)` is what the page, the hourly run and (through `replayPoisson`) the backtest all call: the provider's matches of strictly earlier UTC days, no more than 1 500 back | S12 and S17. A live prediction and a backtested one for the same day are then the same fit, not two rules that agree. |
| How the fit is found | Sweeps in turn over the base rates, the home advantage, the attacks and the defences, each set to the value that makes the scores most likely given the others, until no parameter moves more than 0,0001 in a sweep (at most 500 sweeps) | #515's prototype did the same sweeps, three a day, warm-started from the day before. A page fit starts cold, so a fixed count would have made the page's fit and the backtest's two different ones. Run to a tolerance, a cold fit and a warm one end in the same place. |
| The tolerance | 0,0001 on a log-strength, not smaller | A shift of every attack one way and the base rate the other barely changes any expected goal count, so the sweeps crawl along it: at 0,000001 a warm fit took about 250 sweeps instead of about 10, for predictions that differ in the fifth decimal. Measured below. |
| The backtest's warm start | Each day's fit starts from the day before's, for the teams and competitions still in the window | Speed only. It ends where a cold fit ends, within the tolerance; a unit test compares the two. |
| A team outside the window | Absent from the fit, so average | S4. #515's prototype kept a team's last strength for ever once it had one; a club back after more than 1 500 days is here an average side, as the spec says. |
| The prior on rates | Half a goal on each competition's base rate and on the home advantage | #515's prototype had it on the base rate only. Without it a history with no home goal at all gives a home advantage of minus infinity. With thousands of matches it moves nothing a reader could see. |
| The draw factor (S16) | Per competition, inside the fit: the plain grid's draw probability of every one of the competition's fitted matches, and the factor (searched between a thousandth and a thousand) that brings their average, once scaled, to those matches' draw share; unweighted | S16. The share is of the same matches the probabilities are of, so the two sides of the equation describe one set. Unweighted because S16 says the draw share of those matches, not a decayed one. |
| No draw factor (S14) | 1 when the fitted matches of the competition have no draw, or nothing else | S14, now within the window rather than "ever", since the window is all the fit reads. |
| A competition with no match in the fit | No prediction: no row in the log, no `Poisson` row in `Ennuste`, and no failure line | The spec's edge case is a competition with no finished match. A competition whose only matches are today's, or all older than 1 500 days, has no base rate either, and is treated the same. #515's prototype predicted such a match from a base rate of one goal. |
| A placeholder side | Its match is neither fitted nor predicted | S15, and as specs/053: there is no team to give a strength to. |
| Expected goals in `Ennuste` | The fit's, before the grid is cut at ten goals | They are what the model expects; the grid's own means differ in the third decimal. |
| The most likely score's probability | From the final grid, the draw factor in it | It is the probability the three outcomes are summed from. |
| The hourly run's fit | From the same read as Elo's ratings, on the UTC day the run started; a failure is logged, reported as `poisson strengths`, and costs only `poisson-v1`'s rows | S19. One read feeds both models, so a failed read is reported once under each. |
| The page's cache | `poisson:v1:<provider>`, 15 minutes: the fit, its maps as pairs | The cache helper stores JSON. The key does not carry the day: after midnight UTC a cached fit is at most 15 minutes behind, which S11 already accepts. |
| `/ennusteet`'s third line | A fourth style, `dashDotted` (`6 4 2 4`), on `LineSeries` and `LineLegend` | S18. Lines are told apart by dash, never colour (specs/032 Q5); dashed, dotted and solid were taken. |
| `/ennusteet`'s window line | `…, joille kaikki mallit ovat antaneet ennusteen.` | It said `molemmat mallit`. "All" stays true when a fourth model is judged. |
| `/ennusteet`'s cache key | `quality:v2:<provider>:<kind>` | A report cached under `v1` has two models; the page would show it for up to 15 minutes after a deploy. |
| `/ennusteet` right after a deploy | Shows `Ennusteita, joiden ottelu on jo pelattu, ei ole vielä.` until the backtest has been run in that environment | Only matches all three models predicted are judged (S18), and `poisson-v1` has no rows until `npm run predictions -- backtest` has run. The same step as after specs/053. |
| `Ennakkoon tehdyt` after this ships | Judges only matches kicked off since `poisson-v1` began logging | The same rule: an earlier live match has no `poisson-v1` row. The backtested figures are unaffected. |
