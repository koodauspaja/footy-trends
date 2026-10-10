# 057 — Surprise index: the biggest upsets, by what Elo expected

> **Status: three questions open (Q17–Q19), see Open Questions.** Q1–Q12 were
> answered in chat on 2026-10-01. The spec was read again on 2026-10-10
> against what specs/054, 055 and 056 built, and measured on production; S13–S16
> record what that settled. Written for #354, release 3 in the predictions
> plan. It reads what Elo predicted before each match (specs/053, logged by
> specs/052) and sets it against what happened.

## Summary

Every football fan remembers the upsets. Elo said before each match how likely
each outcome was; a result Elo gave 8 % is a bigger shock than one it gave
40 %. This ranks a season's matches by how unlikely their result was, so a
reader sees the biggest surprises of a competition's season — and, on a
finished match, how surprising that one was.

## Scope

### In scope

- A surprise figure for every finished match Elo predicted (S1, S2).
- The biggest surprises of a competition's season (S3–S6).
- The figure on a finished match's page (S7).
- The hourly predictions run writes the backtest rows of matches that have
  finished since the last backtest (S13), so the list and the line include
  last night's match.

### Out of scope

- Any model but Elo, as #354 names it (S2).
- The Suomen Cups, the Liigacups and national teams, which Elo does not rate
  (specs/053 S5). The Champions League is a covered competition and has the
  list, its knockout matches included.

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | The measure | **The probability Elo gave to what happened, shown as a percentage; the smaller, the bigger the surprise** | Miikka, 2026-10-01 (Q1): "all good suggestions". |
| S2 | Which prediction | **The `elo-v1` backtest row** | Miikka, 2026-10-01 (Q2). It exists for every match and knows only what came before kickoff. |
| S3 | Where | **The competition's standings page, a panel `Kauden suurimmat yllätykset` for the selected season** | Miikka, 2026-10-01 (Q3). |
| S4 | Which group | **A new group, `Tämä kausi`, first in `Analyysit`** | Miikka, 2026-10-01 (Q4). A season's matches are a question neither existing group asks (#424's rule). |
| S5 | How many | **The 10 most surprising: date, match and score, Elo's probability; each linking to its match** | Miikka, 2026-10-01 (Q5). |
| S6 | Draws | **Every outcome counts the same** — *under question, Q18* | Miikka, 2026-10-01 (Q6). |
| S7 | The match page | **On a finished match Elo predicted: `Elo antoi tälle tulokselle 8 %.` under the score; nothing otherwise** | Miikka, 2026-10-01 (Q7). |
| S8 | The season in progress | **Included, marked `(kesken)`** | Miikka, 2026-10-01 (Q8). As specs/048. |
| S9 | Elo's run-in | **No list for a competition's first stored season, and a line saying why** — *the line's wording under question, Q17* | Miikka, 2026-10-01 (Q9). specs/053 S7. |
| S10 | Access | **Signed in only** | Miikka, 2026-10-01 (Q10). |
| S11 | The strings | **As in UX / UI** | Miikka, 2026-10-01 (Q11): "good as suggested"; the strings may be fine-tuned during implementation. |
| S12 | Two rules | **No predicted match: `Kaudelta ei ole vielä pelattuja otteluita.`; equally surprising matches list the earlier kickoff first** | Miikka, 2026-10-01 (S12). |
| S13 | Fresh backtest rows | **The hourly run also writes the backtest rows of finished matches, inside this feature** — *its rules proposed in Q19* | Miikka, 2026-10-10 (Q13): "questions as you suggested", then "if it can go in here, put it in". Backtest rows were written by hand only (specs/052 S10): on production the last were from 2026-10-06, and by 2026-10-10 26 finished matches had a live Elo row and no backtest row. |
| S14 | Which matches count | **A finished match with both scores and an `elo-v1` backtest row — Elo's row alone, whatever the other models have** | Miikka, 2026-10-10 (Q14). `/ennusteet` judges only matches all three models predicted (specs/055 S18); #354 is about Elo, so this spec calls its matches *predicted*, not *judged*. |
| S15 | Logging | **As in Logging** | Miikka, 2026-10-10 (Q15). The section did not exist when this spec was written. |
| S16 | Where `(kesken)` goes | **A line under the panel's heading, `Kausi 2026 (kesken)`, shown only for the season in progress** | Miikka, 2026-10-10 (Q16). The heading names no season to label. |

## UX / UI (Finnish strings)

**Competition standings page, `Analyysit`** (S3, S4), signed in:

1. `Tämä kausi` — new group, first, before `Kausi kaudelta` and
   `Kilpailut rinnakkain`
2. `Kauden suurimmat yllätykset` — panel heading
   - The season in progress only: `Kausi 2026 (kesken)` under the heading, the
     season named as the page's own selector names it (S8, S16)
   - A numbered list, most surprising first, ten at most (S5):
     `21.4.2025 · Ilves – HJK 3–0 · Elo antoi 6 %` — the date, the match
     linking to its page, the score, and Elo's probability for that result
   - Under the list: `Yllätys on sitä suurempi, mitä pienemmän todennäköisyyden Elo antoi toteutuneelle tulokselle ennen ottelua.`

**Match page** (S7), under the score of a finished match Elo predicted:
`Elo antoi tälle tulokselle 8 %.`

| String | When |
|---|---|
| `Elo-ennusteita ei ole kilpailun ensimmäiseltä tallennetulta kaudelta: kaikki joukkueet aloittavat silloin samasta luvusta.` | The competition's first stored season (S9; wording under question, Q17) |
| `Kaudelta ei ole vielä pelattuja otteluita.` | No predicted match in the season (S12) |
| `Yllätyksiä ei voitu laskea. Yritä myöhemmin uudelleen.` | The read failed |

## API & Data

**No new table, no provider request, no new rating computation.**

| Needed | Where |
|---|---|
| Elo's prediction for each match | `predictions`, `model = elo-v1`, `kind = backtest` (S2) |
| The result | The match's stored score, finished with both scores, the shoot-out subtracted (specs/049 S3) |
| The surprise | The prediction's probability for the outcome that happened (S1) |
| A competition-season's list | Its predicted matches (S14), ten with the smallest probability; ties the earlier kickoff first (S12). A domestic competition played in several groups has one list across them |
| A match's figure | Its own row; none if Elo has no row for it (S7) |
| The first stored season | The competition's earliest season with a stored finished match (S9) |
| Access | `canSeeAnalytics()` before anything is read (S10) |

**The hourly run** (`npm run predictions -- log`, specs/052) gains a step
after its live rows are written (S13; the rules are Q19's until confirmed):

| | |
|---|---|
| What it writes | A `backtest` row, of each of the three models, for every finished match that has none of that model — what `predictions -- backtest` would write for that match |
| What it leaves | A backtest row that exists. `predictions -- backtest` by hand still rewrites every row, and is still run after a release that adds a model |
| Afterwards | The `/ennusteet` backtest reports are dropped from the cache, as the hand-run backtest drops them (specs/056) |
| Where | Production, where the cron runs. Staging has no cron (specs/052 S11) and is backtested by hand, as now |

**Caching:** none, as specs/049 — one indexed join for one competition-season.

## Edge Cases

| Case | Behaviour |
|---|---|
| A competition's first stored season | No list; the S9 line |
| A season with no predicted match yet | The no-matches line (S12) |
| A season with fewer than ten predicted matches | All of them, still most surprising first |
| Two matches equally surprising | The earlier kickoff first (S12) |
| A match Elo has no row for (a placeholder side, a competition's first kickoff, finished within the hour) | Not in the list; no line on its page |
| A match with a `live` Elo row and no backtest row | As having no row: the backtest row is the only one read (S2) |
| A shoot-out | A draw (specs/049 S3) |
| A Suomen Cup, Liigacup or national-team match | Never listed, no line (Scope) |
| Signed out | No figure in the HTML (S10) |

## Performance & Limits

One indexed read of a competition-season's predicted matches.

The hourly run's new step replays what it already reads. A whole backtest
takes about 32 s, most of it Poisson's fit per match day (decisions/055), so
the step computes only what the missing rows need. Its added time on
production's data is measured before review and recorded in the decision
record.

## Security & Secrets

No new environment variable or secret.

## Logging

The pages only read; the hourly run's step writes shared data.

| Event | Level | Line |
|---|---|---|
| A season's list cannot be read | `error` | `Unable to read the season's surprises`, with the provider, the competition code and the season |
| A match's figure cannot be read | `error` | `Unable to read the match's surprise`, with the provider and the match id |
| The hourly run's backtest step fails | `error` | `Unable to write the backtest rows for predictions`; the run reports `backtest` among its failures (Q19) |
| The hourly run ends | `info` | The existing `Predictions run finished` line gains `backtested`, the rows the step wrote |

Ids only: no name, email address or token. The run acts as itself, so no line
names a user.

## Acceptance Criteria

*These follow the settled decisions; Q17–Q19 may change the first-season,
draw and hourly-run lines.*

- [ ] Signed in, a covered competition's standings page shows `Tämä kausi` first in `Analyysit`, holding `Kauden suurimmat yllätykset`
- [ ] The list is the selected season's ten predicted matches with the smallest probability Elo's backtest gave their result, ties the earlier first; each shows date, match (linked) and score, and the probability
- [ ] A shoot-out counts as a draw; a match without an Elo backtest row is not listed
- [ ] The season in progress is included and shows `Kausi … (kesken)` under the heading; a finished season shows no such line
- [ ] A competition's first stored season shows the run-in line instead of a list
- [ ] A finished match Elo predicted shows `Elo antoi tälle tulokselle N %.` under its score; others show nothing
- [ ] A failed read shows the failure line and logs its `error` line; signed out, no figure is in the HTML
- [ ] After an hourly run, a match that finished before it has a backtest row of every model that can predict it, and the run's summary and log line count the rows written
- [ ] A failed backtest step leaves the run's live rows written, is reported as a failure and logged
- [ ] `docs/infrastructure.md` says the hourly run writes backtest rows
- [ ] No provider request beyond those the hourly run already makes
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/surprise.test.ts` | The probability of the outcome that happened, each outcome; ranking, the ten, ties; the first-season rule |
| `tests/unit/lib/surprise-service.test.ts` | The read for one competition-season and for one match; each failure as its own case, with its log line |
| `tests/unit/components/competition-analytics.test.tsx` | The group first, the list and its links, the `(kesken)` line, the explanation, every Finnish line; signed out |
| The match page's component test | The line on a finished predicted match; nothing on any other; signed out |
| `tests/unit/lib/prediction-log-service.test.ts` | The step writes only the missing rows, of all three models; a failure keeps the live rows and is reported |
| `tests/unit/scripts/predictions-plan.test.ts` | The summary's new line |
| `tests/integration/surprise.test.ts` | The join against Postgres: a shoot-out a draw; backtest rows only, a live row never read |
| `tests/integration/predictions.test.ts` | A run after a match finishes leaves its backtest rows; a second run writes none |
| `tests/e2e/surprise.spec.ts` | Signed in, a real competition's list; a finished match's line |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/057-surprise-index.md` (this file)
- A pure module, its service, and the competition page and the match page
  (S7)
- `src/lib/prediction-log-service.ts` and `scripts/predictions-plan.ts` (S13)
- `docs/infrastructure.md`, The predictions cron: what writes backtest rows
- `decisions/057-surprise-index.md`, by the implementing agent, which says it
  overrides specs/052 S10's "by hand only"

## Open Questions

Measured read-only on production, 2026-10-10.

**Q17 — the first-season line (S9).** The rule holds: Premier League 2023 and
Ykkösliiga 2024, each its competition's first stored season, both contain a
result Elo gave 0,0 %. The reason in the string is false for Ykkösliiga, whose
clubs arrived in 2024 with ratings from 2015 on; it is the only competition
whose stored history starts later than its provider's. Proposed string:
`Kilpailun ensimmäiseltä tallennetulta kaudelta ei näytetä yllätyksiä: Elolla ei ole silloin vielä aiempia otteluita, joihin nojata.`

**Q18 — draws (S6).** Elo's draw probability is the competition's draw share
(specs/053 S4), about 25 % for every match, so most lists fill with draws that
all show the same figure, in date order:

| Competition | Draws among the ten, average per season | Range |
|---|---|---|
| Naisten Ykkönen, Kansallinen Liiga, Kakkonen, P21 SM | 9,6–9,8 | 8–10 |
| Ykkönen | 8,5 | 6–10 |
| Champions League | 7,0 | 2–10 |
| Premier League | 4,7 | 0–10 |
| Veikkausliiga | 1,6 | 0–7 |

Veikkausliiga 2026: KuPS – IFK Mariehamn 2–4 at 10 %, two more wins, then
seven draws at 25,2 %. Proposed: **draws are left out of the list, and a drawn
match shows no line on its page**; the list ranks home and away wins. The
alternative is S6 as answered.

**Q19 — the hourly step's rules (S13).** Proposed:

1. It writes only rows that are missing, of all three models, so `/ennusteet`'s
   `Jälkikäteen lasketut` stays current too. A whole backtest every hour would
   take about 32 s and rewrite some 85 000 rows.
2. A row once written is not rewritten by the run. If an earlier match's
   result arrives or changes afterwards, the row keeps what was known when it
   was written, until a backtest by hand.
3. The step runs after the live rows are written. If it fails, the live rows
   stand, the run reports `backtest` as a failure and exits non-zero.
4. The summary gains `Backtested   N prediction(s)`.
