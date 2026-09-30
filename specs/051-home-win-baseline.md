# 051 — Home-win baseline: a competition's own history as a prediction

> **Status: all questions (Q1–Q12) answered in chat on 2026-09-30, awaiting
> the go.** Written for
> #343, the first of the prediction features (#343–#354, #480). The predictions
> log, #349, is a separate spec (S10).

## Summary

Before any model says who will win, there has to be the answer a model must
beat: "home teams in this competition win this often". This shows, on an
upcoming match's page, the chance of a home win, a draw and an away win taken
from nothing but the competition's own past results — no team, no form. Every
later model (#344 Elo, #345 Poisson) is judged against it, and it sets up where
and how a prediction is shown.

The counting already exists: specs/049's `Kotietu ja tasapelit` counts each
competition-season's home wins, draws and away wins. This baseline sums those
counts for one competition over **all** its stored history, the season in
progress included (S2), and reads the shares as probabilities for its next
match.

## Scope

### In scope

- A panel, `Ennuste`, on the match page of an upcoming match (S3, S6), in the
  competitions specs/049 S6 compares (S5), signed in only (S4).
- Three probabilities — home win, draw, away win — from every stored finished
  match of the competition (S1, S2).
- An exported model identifier, `home-baseline-v1`, for #349 to record (S10).

### Out of scope

- Logging predictions, and any accuracy or calibration figure — #349, #350,
  #351.
- Backtesting past matches — decided in #349's spec (S10).
- A prediction on a match that has kicked off, finished, or will not be played
  (S3).
- Any team-specific model — #344 onward.
- The domestic cups, the World Cup, the Euro, Huuhkajat and Helmarit (S5).
  National teams can join once more tournaments are stored.
- A split bar or any chart (S7).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | What is predicted | **Three probabilities**: home win, draw, away win | Miikka, 2026-09-30 (Q1). #351 (Brier score, log-loss, calibration) needs probabilities; a pick falls out of them, not the other way round. |
| S2 | Which history | **Every stored finished match of the competition, from its earliest stored season — 2023 for football-data, earlier where TASO has it — the season in progress included, up to now** | Miikka, 2026-09-30 (Q2): "from history start, 2023 or earlier if available. include the ongoing season so far". This deliberately differs from specs/049 S8/S19 (completed seasons from 2023): the panel and the competition page's table can show different shares for the same competition, and the explanation line names the seasons so the difference is visible. |
| S3 | Which matches get the panel | **Upcoming only: status `SCHEDULED` or `TIMED`** | Miikka, 2026-09-30 (Q3). On a finished match it would read as a prediction made after the fact — backtesting, which is #349's to decide. |
| S4 | Access | **Signed in only**, `canSeeAnalytics()` | Miikka, 2026-09-30 (Q4). As every other analytic. |
| S5 | Which competitions | **specs/049 S6's set** — the leagues specs/048 S5 names and the Champions League, both providers | Miikka, 2026-09-30 (Q5). Cups and national teams play one-off or neutral-venue matches; national teams can join when more tournaments are stored. |
| S6 | Placement | **`Ennuste`, between the match details and `Keskinäiset ottelut`**, no group heading | Miikka, 2026-09-30 (Q6). The match page has no `Analyysit` section yet; one panel does not need a group. |
| S7 | Display | **Three whole percentages as text**; no bar | Miikka, 2026-09-30 (Q7). A bar earns its place when there are two models to compare (#344). |
| S8 | The same for every match | **Said outright in the explanation line** | Miikka, 2026-09-30 (Q8). Otherwise 45/26/29 on every Veikkausliiga fixture looks like a bug. |
| S9 | No history | **The panel, with a line saying there is not enough history**, instead of no panel | Miikka, 2026-09-30 (Q9). |
| S10 | Link to #349 | **#343 ships on its own and exports `home-baseline-v1`**; logging and backtesting are #349's spec | Miikka, 2026-09-30 (Q10). |
| S11 | Minimum history | **None**: percentages show from the first finished match; the S9 line means zero finished matches | Miikka, 2026-09-30 (Q11). The count in the explanation line shows what the figures rest on, as specs/049 S10; every covered competition has seasons of history, so this only affects a brand-new one. |
| S12 | specs/049's window | **Unchanged**: its table keeps completed seasons from 2023 | Miikka, 2026-09-30 (Q12). The table compares competitions, so its rows need the same era and whole seasons (specs/049 S8, S19); the baseline is one competition, where more of its own history is simply more evidence. The two can differ, and the explanation line names the baseline's seasons so a reader can see why. |

## UX / UI (Finnish strings)

Signed in, on the match page of an upcoming match (S3) in a competition S5
covers, after the match details and before `Keskinäiset ottelut` (S6):

1. `Ennuste` — panel heading
   - `Kotivoitto 45 %` · `Tasapeli 26 %` · `Vierasvoitto 29 %` — whole
     percentages (S7), computed from the unrounded shares
   - Under it: `Perustaso: kilpailun 1 234 ottelun tulokset kausilta 2015–2026.
     Ei huomioi joukkueita, joten ennuste on sama jokaiselle kilpailun
     ottelulle.` — the count and the seasons derived from the data, not
     literals; a spanning season is written `2023/24–2025/26`, as specs/049 S18
     (S2, S8)
   - `Osuudet on pyöristetty, joten niiden summa voi poiketa 100 prosentista.`

| String | When |
|---|---|
| `Ennustetta ei voitu laskea. Yritä myöhemmin uudelleen.` | The read failed |
| `Kilpailusta ei ole vielä tallennettuja otteluita.` | No finished match stored (S9, S11) |
| `Kirjaudu sisään nähdäksesi ennusteen.` | Signed out (S4) |

The count is written with a space as the thousands separator, as elsewhere in
the app's Finnish numbers.

## API & Data

**No new table, no new column, no provider request.**

| Needed | Where |
|---|---|
| The competition's finished matches, home wins, draws, away wins | specs/049's per-season outcome counts in `src/lib/match-service.ts`, read for **one** competition, with no season floor and no completed-season filter (S2) — summed across its seasons |
| A match's result | Its score after extra time: football-data's stored shoot-out subtracted, as specs/049 S3 and #492 |
| The seasons named in the line | The earliest and latest season with a counted match |
| Whether the match is upcoming | Its stored status (S3) |
| Signed in | `canSeeAnalytics()`, before the query (S4) |
| Model identifier | `home-baseline-v1`, an exported constant (S10) |

**Caching:** none, as specs/049 — one aggregate query over indexed columns for
a single competition.

## Edge Cases

| Case | Behaviour |
|---|---|
| A match that is in play, finished, postponed, suspended or cancelled | No panel (S3) |
| A match in a competition S5 does not cover | No panel |
| A competition with no finished match stored | The panel with the S9 line (S11) |
| A competition with a handful of finished matches | Percentages from those; the count in the line shows it (S11) |
| A penalty-decided draw in the history | A draw (specs/049 S3) |
| A match with a result but a missing score | Not counted |
| A TASO competition spanning several category ids | One history (specs/043) |
| The season in progress | Its finished matches count; its unplayed ones do not (S2) |
| A match finishing elsewhere in the competition | The next page view's probabilities include it |
| Rounded shares not adding to 100 % | Printed as rounded; the rounding line says why |
| The read fails | The failure line; the rest of the match page renders |
| Signed out | The sign-in line; no probability in the HTML (S4) |

## Performance & Limits

One aggregate query per upcoming match page view, over one competition's stored
matches — at most a few thousand rows (TASO from 2015), grouped in the database.

## Security & Secrets

No new environment variable or secret. Behind `canSeeAnalytics()`.

## Acceptance Criteria

- [ ] Signed in, an upcoming (`SCHEDULED` or `TIMED`) match's page in a
      competition specs/049 S6 compares shows `Ennuste` between the match
      details and `Keskinäiset ottelut`
- [ ] The three percentages are the competition's home-win, draw and away-win
      shares over every stored finished match, the season in progress included
- [ ] A drawn match settled on penalties counts as a draw — on football-data,
      with the stored shoot-out subtracted
- [ ] The explanation line names the match count and the seasons, derived from
      the data, and says the prediction is the same for every match
- [ ] With no finished match stored, the panel shows the Finnish line instead
      of percentages; with one or more, it shows percentages
- [ ] A match in play, finished, postponed or cancelled has no panel
- [ ] A cup or national-team match has no panel
- [ ] If the read fails, the panel shows the failure line and the rest of the
      page renders
- [ ] Signed out, no probability is in the page's HTML
- [ ] `home-baseline-v1` is exported for #349
- [ ] No provider request is made
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/home-baseline.test.ts` | Seasons' counts summed into three shares; penalty-decided draw a draw; the season range and count for the line, both kinds of season; zero finished matches gives the no-history state, one gives percentages (S11); the model identifier |
| `tests/unit/lib/match-service….test.ts` | The single-competition read: no season floor, the season in progress's finished matches counted, unplayed ones not; TASO across category ids; failure |
| `tests/unit/components/match-page….test.tsx` | Panel placement; percentages and the two lines; each non-upcoming status without a panel; an uncovered competition without one; failure line; signed out, no value |
| `tests/integration/…` | The read against the real schema: a football-data shoot-out counted as a draw; a scheduled match not counted; a TASO season before 2023 counted |
| `tests/e2e/…` | Signed in, a real upcoming league match shows `Ennuste`; signed out, the sign-in line |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/051-home-win-baseline.md` (this file)
- A new pure module, `src/lib/home-baseline.ts`, and the single-competition
  read in `src/lib/match-service.ts`
- `src/components/match-page.tsx` — the panel
- `decisions/051-home-win-baseline.md`, by the implementing agent

## Open Questions

**None.** Q1–Q12 were answered in chat on 2026-09-30 and are recorded as
S1–S12.
