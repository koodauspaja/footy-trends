# 053 — Elo ratings: a strength for every team, and a prediction from it

> **Status: all questions (Q1–Q15) answered in chat on 2026-10-01.** Written for #344, the first
> model of release 2 in the predictions plan, after specs/051 (the home-win
> baseline) and specs/052 (the predictions log). #346 (Elo variants), #347
> (season simulation) and #348 (a draw model) build on it and are out of
> scope.

## Summary

The baseline predicts every match in a competition the same way. Elo is the
first model that knows who is playing: every team carries a rating, the
stronger side is expected to win more often, and after each match the winner
takes rating points from the loser — more for an upset. Replayed over every
stored result, the ratings say how strong each team is now and how that has
changed, which is also the "team strength over time" chart #344 asks for.

Its predictions go into the log next to the baseline's (specs/052), so
release 2's accuracy features (#350, #351) can say whether knowing the teams
beats not knowing them.

## Scope

### In scope

- An Elo rating for every team in the competitions specs/051 S5 covers (Q1),
  computed from stored finished matches only.
- A three-way prediction (home win, draw, away win) for an upcoming match
  from the two ratings (Q4–Q6).
- The model logged as `elo-v1`, live by the hourly run and backtested
  (specs/052).
- Showing it: on the match page beside the baseline (Q8), and a rating chart
  on the team page (Q9).

### Out of scope

- Form weighting, margin of victory, a fitted home advantage per team — #346.
- A dedicated draw model — #348.
- Simulating the season — #347.
- Accuracy, calibration or model comparison figures — #350–#352.
- Cups and national teams, as specs/051 S5, unless Q1 says otherwise.

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | What a rating spans | **One rating per team across its provider's covered competitions** | Miikka, 2026-10-01 (Q1). A promoted club keeps its strength; a per-competition rating would restart it at the average when it is most wrong. |
| S2 | Constants | **K = 20, home advantage = 60 rating points**, fixed in `elo-v1` | Miikka, 2026-10-01 (Q2). The common football values; tuning is #346's, measured by #350/#351. |
| S3 | Start and carry-over | **Every team starts at 1500; at a new season a rating moves a third of the way back to 1500** | Miikka, 2026-10-01 (Q3). Squads change over the break. |
| S4 | Three outcomes | **The draw probability is the competition's draw share; the rest is split home/away by the Elo expectation** | Miikka, 2026-10-01 (Q4). #348 replaces the rule. |
| S5 | Matches counted | **The covered competitions only** (specs/051 S5), no cups | Miikka, 2026-10-01 (Q5). |
| S6 | History | **All stored history**, TASO from 2015, football-data from 2023 | Miikka, 2026-10-01 (Q6). The early seasons are the run-in. |
| S7 | Backtest | **Every match logged**, run-in included | Miikka, 2026-10-01 (Q7). #351 chooses its window; an unwritten row cannot be recovered. |
| S8 | The match page | **Beside the baseline**: two rows in `Ennuste`, `Perustaso` and `Elo` | Miikka, 2026-10-01 (Q8). |
| S9 | The rating chart | **A new panel, `Joukkueen vahvuus (Elo)`, every stored season on one line, in `Muut kaudet`** | Miikka, 2026-10-01 (Q9). |
| S10 | The rating number | **Shown on the chart's axis, with a line saying 1500 is an average team** | Miikka, 2026-10-01 (Q10). |
| S11 | Computing it | **Replayed in memory, cached in Redis per provider for 15 minutes; no new table** | Miikka, 2026-10-01 (Q11). Measured before anything heavier. |
| S12 | Access | **Signed in only** | Miikka, 2026-10-01 (Q12). |
| S13 | The strings | **As in UX / UI**: `Perustaso` first, then `Elo` | Miikka, 2026-10-01 (Q13), "yes, that's good". |
| S14 | A new season | **A team's first match with a later season id than its previous one** | Miikka, 2026-10-01 (Q14). Each provider's own seasons decide; one regression per season whichever competition. |
| S15 | The draw share | **Live: the competition's baseline draw share now; backtest: the draw share of strictly earlier matches** | Miikka, 2026-10-01 (Q15). A backtest prediction knows nothing from after its kickoff (specs/052 S14). |
| S16 | No draw share yet | **No Elo prediction** for a competition with no finished match | Miikka, 2026-10-01, confirming the proposed edge case. As specs/051 S9. |
| S17 | The cache and the log | **The hourly run and the backtest replay for themselves**; only pages read the cache | Miikka, 2026-10-01, confirming the proposed rule. A cached copy must never stand in for what a prediction knew. |

## UX / UI (Finnish strings)

**Match page, `Ennuste` (S8)** — the specs/051 panel becomes two rows:

| | Kotivoitto | Tasapeli | Vierasvoitto |
|---|---|---|---|
| `Perustaso` | `45 %` | `26 %` | `29 %` |
| `Elo` | `52 %` | `26 %` | `22 %` |

Under it, specs/051's baseline line unchanged, then:
`Elo: {koti} {1563}, {vieras} {1488}. Kotijoukkueelle lisätään 60 pistettä, ja tasapelin todennäköisyys on kilpailun tasapelien osuus.`
then specs/051's rounding line.

**Team page, `Muut kaudet` (S9, S10)** — panel `Joukkueen vahvuus (Elo)`:
- a line chart, the rating after each of the team's matches, x axis the
  seasons, y axis `Elo-luku`
- under it: `1500 on keskitasoinen joukkue. Luku nousee voitoista ja laskee tappioista sitä enemmän, mitä vahvempaa vastustajaa vastaan ottelu pelattiin.`
- a text alternative listing each season's last rating, as the other charts'

| String | When |
|---|---|
| `Vahvuutta ei voitu laskea. Yritä myöhemmin uudelleen.` | The replay failed |
| `Joukkueella ei ole tallennettuja otteluita näistä kilpailuista.` | The team played none of the covered competitions |

## API & Data

**No new table, no provider request.**

| Needed | Where |
|---|---|
| Every stored finished match of the covered competitions, per provider | One read per provider, as specs/052's backtest reads them: finished, both scores, the shoot-out subtracted on football-data (specs/049 S3); TASO rows filed by their season pair |
| The replay | Pure: in kickoff order, matches at one kickoff rated from the ratings before any of them; a team's first match in a later season regresses it a third of the way to 1500 (S3, S14) |
| A prediction | Expected home score `E = 1 / (1 + 10^((Rᵃ − (Rʰ + 60)) / 400))`; draw = the competition's draw share `d` (S4, S15); home = `(1 − d) · E`, away = `(1 − d) · (1 − E)` |
| An update | Result `S` = 1, ½ or 0 for the home side; both ratings move by `20 · (S − E)`, in opposite directions (S2) |
| Live predictions | The hourly run (specs/052) logs `elo-v1` beside `home-baseline-v1` for every match it logs |
| Backtest | `npm run predictions -- backtest` writes `elo-v1` rows too: each match predicted from the ratings and draw share before its kickoff (S7, S15) |
| Cache | The replay's result per provider in Redis for 15 minutes (S11) |
| Signed in | `canSeeAnalytics()` before either panel reads anything (S12) |

**Caching:** the replay per provider, 15 minutes, keyed by provider. The
hourly run and the backtest compute their own replay and do not read the
cache, so a cached copy can never stand in for what a prediction knew.

## Edge Cases

| Case | Behaviour |
|---|---|
| A team's first stored match | Rated from 1500 (S3) |
| A promoted or relegated team | Keeps its rating across tiers (S1) |
| A team's first match of a new season | Its rating first moves a third of the way back to 1500 (S3, S14) |
| Two matches at the same kickoff | Each predicted from the ratings before either; both then update (as specs/052 S14) |
| A placeholder team (TASO id `0`) | Never rated; a match with one is neither rated nor predicted |
| A shoot-out | A draw for the ratings (specs/049 S3) |
| A cup or national-team match | Ignored by the ratings, and gets no prediction (S5) |
| A team with no covered match | The team page's panel shows the no-matches line |
| The replay fails | The failure line in each panel that needed it; the rest of the page renders |
| Signed out | No rating or probability in the HTML (S12) |
| A competition whose draw share is not yet known (no finished match) | No Elo prediction, as the baseline gives none (specs/051 S9) |

## Performance & Limits

A replay is every stored finished match of one provider once, in kickoff
order: about 11 000 football-data and 17 000 TASO matches in production
today. In memory that is milliseconds; reading the rows is the cost, which
S11's cache bounds to one read per provider per 15 minutes. Measured on
production-sized data before review; a table is the next step only if the
measurement says so.

## Security & Secrets

No new environment variable or secret.

## Acceptance Criteria

- [ ] Every team of the covered competitions has a rating from all stored history, starting at 1500, moved by K = 20 with 60 home points, and regressed a third of the way to 1500 at each new season
- [ ] Matches at one kickoff are rated from the ratings before any of them; a shoot-out counts as a draw; placeholder teams and uncovered competitions are ignored
- [ ] An Elo prediction's draw is the competition's draw share, and home and away split the rest by the Elo expectation
- [ ] Signed in, an upcoming match's `Ennuste` shows `Perustaso` and `Elo` rows, and the Elo line naming both teams' ratings
- [ ] Signed in, a team page shows `Joukkueen vahvuus (Elo)` in `Muut kaudet`: the rating after each match across every stored season, the 1500 line, and a text alternative
- [ ] The hourly run logs `elo-v1` beside `home-baseline-v1`; the backtest writes `elo-v1` rows from the ratings and draw share before each kickoff only
- [ ] A failed replay shows the Finnish failure line where it was needed; signed out, no rating or probability is in the HTML
- [ ] No provider request is made, and the replay is cached per provider for 15 minutes; its cost on production-sized data is measured and written down
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/elo.test.ts` | One update by hand; the 60 home points; the season regression; same-kickoff matches; a shoot-out a draw; placeholders skipped; the three-way split summing to 1 |
| `tests/unit/lib/…service….test.ts` | One read per provider; the cache hit and miss; failure as its own case |
| `tests/unit/lib/prediction-log….test.ts` | `elo-v1` logged beside the baseline; the backtest's ratings and draw share from before each kickoff |
| `tests/unit/components/…` | The two `Ennuste` rows and the Elo line; the team panel, its group, the 1500 line, the text alternative; failure and signed-out states |
| `tests/integration/…` | The read against Postgres: TASO rows by pair, the shoot-out subtracted; the backtest writing `elo-v1` rows |
| `tests/e2e/…` | Signed in, a seeded upcoming match shows both rows; a real team page shows the panel |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/053-elo-ratings.md` (this file)
- A pure rating module, its service, and the predictions run and backtest
- The match page's `Ennuste` and the team page's `Analyysit`
- `decisions/053-elo-ratings.md`, by the implementing agent

## Open Questions

**None.** Q1–Q15 were answered in chat on 2026-10-01 and are recorded as
S1–S15; S16 and S17 confirm two edge-case rules proposed with them.
