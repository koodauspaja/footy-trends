# 061 — Season simulation: who is likely to win, go up, or go down

> **Status: revised on 2026-10-12 against `main` after specs/053 to 058 were
> built. Q1–Q12 were answered on 2026-10-01; S1, S5, S8 and S12 are changed
> and S13–S22 added on 2026-10-12, when the last three strings were confirmed
> too. Strings may be fine-tuned during implementation.** Written for
> #347, release 4 in the predictions plan — the heaviest of its pieces. It
> plays out the rest of a season many times with the Poisson model's
> predictions (specs/055) and counts where each team finishes.

## Summary

Halfway through a season the table says who is ahead, but not how likely
that lead is to last: a three-point lead with the hardest fixtures still to
come is not the same as one with the easiest. This plays out every remaining
fixture thousands of times — each result drawn from the Poisson model's
three-way probabilities — and adds the results to the current table, so a
reader sees each team's chance of winning the league, finishing near the top
or the bottom, and its expected points.

## Scope

### In scope

- A simulation of a league's remaining stored fixtures in the season in
  progress, from the current table (S1–S5, S13–S16).
- Each team's chances and expected points, on the competition's standings
  page (S7–S9, S17–S20).

### Out of scope

- The Champions League and the cups — #517 (S6).
- A finished season: nothing left to simulate.
- Competition-specific zones (European places, relegation spots) — #518 (S8).
- Each team's chance of the upper group before a split — #518 (S5). Nothing
  stored says how many teams go up.
- Simulated scorelines and goal difference (S4).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Model | **`poisson-v1`'s three-way probabilities per remaining fixture.** Overrides `elo-v1` of 2026-10-01 | Miikka, 2026-10-12: "if that's your suggestion, yes". Simulated from part-way through 24 finished seasons, Poisson's final points were closer at every stage, and Elo's flat draw share gives a clear favourite ten points too many draws; see Measured. |
| S2 | Runs | **10 000, a seeded generator; the seed is one constant** | Miikka, 2026-10-01 (Q2); the constant, 2026-10-12. The same data gives the same figures. |
| S3 | The model during a run | **Fixed: one fit of the provider's matches, as the match page reads it, for every fixture and every run** | Miikka, 2026-10-01 (Q3), then for ratings. |
| S4 | Ties | **Points, then the current table's order.** The decision record says it understates goal-difference swings | Miikka, 2026-10-01 (Q4), and 2026-10-12: "keep as is". The current order is a total order, so the earlier "then random" could never happen and is gone. Drawing scorelines measured no better and costs three quarters more; see Measured. |
| S5 | Split leagues | **After the split: each group's stored fixtures, points carried over. Before it: to the end of the regular season, expected points and the chance of finishing it first only (S20).** The chance of the upper group is #518's. Overrides the upper-group column of 2026-10-01 | Miikka, 2026-10-12: "your suggestion is good". |
| S6 | Which competitions | **The leagues of specs/051 S5's set, both providers; not the Champions League, not the cups** — the set specs/050's panel has | Miikka, 2026-10-01 (Q6): "keep this to leagues". Knockouts are #517. |
| S7 | Where | **The standings page, specs/057's `Tämä kausi`, a panel `Kauden ennuste`, the season in progress only, above `Kauden suurimmat yllätykset`** | Miikka, 2026-10-01 (Q7); its place in the group, 2026-10-12. |
| S8 | What it shows | **Per team in table order. A season with one table: `Odotetut pisteet`, `Mestaruus`, `Kolmen parhaan joukossa`, `Kolmen huonoimman joukossa`. A season with several tables (split groups, pools): per table `Odotetut pisteet`, first place, last place (S19).** Overrides top three and bottom three in every table | Miikka, 2026-10-12: "your suggestion is good". In a six-team group top three and bottom three are one figure said twice. Real zones are #518. |
| S9 | Rounding | **Whole percentages, `< 1 %` below one, `0 %` only when impossible; points to one decimal**; `100 %` is S18 | Miikka, 2026-10-01 (Q9). |
| S10 | Computing | **On a page view, per competition-season, Redis 15 minutes** | Miikka, 2026-10-01 (Q10). Measured on 2026-10-12: the largest league takes a tenth of a second on a laptop and a fifth inside Railway. |
| S11 | Access | **Signed in only** | Miikka, 2026-10-01 (Q11). |
| S12 | Two rules | **A fixture postponed without a date is still simulated; Kakkonen's pools are each their own table.** The third rule of 2026-10-01, a result stored by the hourly run, is dropped | Miikka, 2026-10-01, and 2026-10-12: "your suggestion is good". The cost does not need it, it would need a table, and staging has no hourly run. |
| S13 | A remaining fixture | **A stored match of the season in a table that is simulated (S15), with no result, both sides real teams, unless its status says it will not be played as listed: football-data's `CANCELLED` and `AWARDED`, TASO's `Abandoned`.** Every other status without a result is to be played: `SCHEDULED`, `TIMED`, `POSTPONED`, and a match being played | Decided for Miikka, 2026-10-12: "make a consistent decision and wording". A cancelled match comes back when the provider lists it again; an abandoned one from August would otherwise be simulated all winter. |
| S14 | Which matches of a league | **football-data: stage `REGULAR_SEASON` only. TASO: the groups that keep a table we calculate** | The Championship's play-offs are stored under its code. |
| S15 | A table that is not simulated | **A TASO group shown from TASO's own numbers (pass-through), and a group shown as a match list.** Its teams are not in the panel | As S13; its line confirmed by Miikka, 2026-10-12. Our table disagrees with the published one there, so simulated points would be added to a figure known to be off. |
| S16 | The current table | **Read through the standings page's own path, which refreshes matches and group rows together; never from stored group rows. football-data's is calculated from its `REGULAR_SEASON` matches alone (S14)** | The hourly run refreshes matches only: on 2026-10-12 production's group rows were thirteen days behind its matches. |
| S17 | A group with no fixture left while another has | **Shown, each chance `100 %` or `0 %`; except a group that has been continued, whose teams are in its continuation groups** | As S13. The no-fixtures line is for a season with none left in any table. |
| S18 | Near certain | **`> 99 %` at 99,5 or more unless decided; `100 %` only when decided** | As S13; the string confirmed by Miikka, 2026-10-12. S9's rule for `0 %`, said for the other end. |
| S19 | First and last place of a table | **First: `Mestaruus` when the stored group is named `Mestaruussarja`, else `Sarjan voitto`. Last: `Sarjan viimeinen sija`** | Miikka, 2026-10-12: "If e.g. the group is called Mestaruussarja, then Mestaruus. if something else, then "Sarjan voitto" rather than "Ryhmä"". The last-place string was confirmed the same day: "Yes, seems good". |
| S20 | Before a split | **A league whose previous stored season had a carry-over group and whose season in progress has none yet: `Odotetut pisteet` and `Runkosarjan voitto` per table, and the line that the forecast ends at the regular season** | Miikka, 2026-10-12. Wrong in a year a league stops splitting, and then only by showing fewer columns. First seen in April 2027. |
| S21 | The model's record | **A link under the panel to `/ennusteet` filtered to the competition, as `Ennuste` has (specs/058 S13)** | Miikka, 2026-10-12. |
| S22 | Logging | **One `error` line for a failed simulation; nothing else** | As S13; see Logging. |

## UX / UI (Finnish strings)

On a covered league's standings page, signed in, for the season in progress,
first in specs/057's group `Tämä kausi` (S7):

`Kauden ennuste` — panel heading
- A season with one table (S8): a table, a row per team in the current
  table's order: `Joukkue` · `Odotetut pisteet` · `Mestaruus` ·
  `Kolmen parhaan joukossa` · `Kolmen huonoimman joukossa`
- A season with several tables (S8, S19): a table per simulated group, in the
  standings page's order, headed with the group's name: `Joukkue` ·
  `Odotetut pisteet` · `Mestaruus` or `Sarjan voitto` · `Sarjan viimeinen sija`
- Before a split (S20): `Joukkue` · `Odotetut pisteet` · `Runkosarjan voitto`
- Percentages whole, `< 1 %`, `> 99 %`, `0 %` and `100 %` only when decided;
  points `52,4` (S9, S18)
- Under it: `Jäljellä olevat ottelut on pelattu 10 000 kertaa Poisson-mallin ennusteiden mukaan. Tasapisteissä ratkaisee nykyinen järjestys.`
- Before a split: `Ennuste ulottuu runkosarjan loppuun; jatkosarjojen ottelut eivät ole vielä tiedossa.`
- Then the link `Kuinka hyvin ennusteet ovat osuneet?`, `Ennuste`'s own
  string, to `/ennusteet` for this competition (S21)

| String | When |
|---|---|
| `Kauden ennustetta ei voitu laskea. Yritä myöhemmin uudelleen.` | The simulation or a read failed |
| `Kaudella ei ole enää pelaamattomia otteluita.` | No remaining fixture in any simulated table of the season in progress |
| `Kauden ennustetta ei lasketa, koska sarjataulukko näytetään Palloliiton tiedoista sellaisenaan.` | No table of the season is simulated (S15) |

## API & Data

**No new table, no provider request of its own.**

| Needed | Where |
|---|---|
| The current table | As the standings page computes it, including a split's carried points (S5, S16) |
| Remaining fixtures | S13 and S14 |
| Each fixture's probabilities | `poisson-v1` from the provider's cached fit (S1, S3): `predictPoisson`'s three outcomes. A team absent from the fit is an average side (specs/055 S4) |
| A run | Each fixture drawn from its three probabilities with the seeded generator (S2); points added; ranked by points, then current order (S4) |
| Figures | Over 10 000 runs: mean points; the share of runs finishing first, last, in the top three and in the bottom three (S8) |
| "Impossible" | A top place (first, the top three): a team that wins every fixture it has left, while no other team gains a point, still ranks below it. A bottom place (last, the bottom three): a team that loses every fixture it has left, while every other team wins all of theirs, still ranks above it. `0 %` only then (S9) |
| "Decided" | A top place: a team that loses every fixture it has left, while every other team wins all of theirs, still holds it. A bottom place: a team that wins every fixture it has left, while no other team gains a point, is still in it. `100 %` only then (S18) |
| Before a split | S20, from the carry-over configuration the standings already keep |
| Cache | Per competition-season, Redis, 15 minutes (S10). It sits on the table's and the fit's own 15 minutes |
| Access | `canSeeAnalytics()` first (S11) |

## Edge Cases

| Case | Behaviour |
|---|---|
| A finished season | No panel (Scope) |
| The season in progress with no fixture left in any table | The no-fixtures line |
| Fixtures left only in tables that are not simulated | The line of S15, not the no-fixtures line |
| A season in progress with no match played yet | Simulated from a table of zeros, in the standings page's order |
| A fixture postponed without a date | Still simulated: it is to be played (S12) |
| A match being played | A remaining fixture until it is stored finished (S13) |
| `CANCELLED`, `AWARDED`, `Abandoned` | Not simulated (S13) |
| A placeholder side in a fixture | Not simulated; the decision record names it — it cannot occur in a league |
| A football-data match of another stage | Neither in the table nor simulated (S14) |
| A split league before the split | To the end of the regular season; S20's columns and line |
| A split league after the split | Within each group's stored fixtures (S5) |
| One group finished, another not | Both shown; the finished one `100 %` and `0 %` (S17) |
| Kakkonen's pools | Each pool simulated as its own table (S12), with S19's columns |
| A pass-through or match-list group | Not simulated; its teams absent (S15) |
| No table of the season simulated | The line of S15 |
| A team absent from the fit | An average side (specs/055 S4) |
| A competition with no match in the fit | No panel, as `Ennuste` shows no Poisson row (specs/055) |
| A team mathematically out of a place | `0 %` there (S9) |
| A team certain of a place | `100 %` (S18) |
| Signed out | No figure in the HTML (S11) |

## Performance & Limits

Measured on production's data, read-only, from a laptop on 2026-10-12, 10 000
runs each, with the prototype the decisions were taken on. The function as
shipped, and the same inside Railway, are in the decision record's Measured:

| League | Teams | Fixtures left | One simulation |
|---|---|---|---|
| The Championship, the largest | 24 | 446 | 89 ms |
| Premier League | 20 | 321 | 64 ms |
| La Liga | 20 | 302 | 62 ms |
| Mestaruussarja | 6 | 17 | 4,5 ms |

A whole Championship season is 552 fixtures. The fit is the match page's
cached one (a cold fit 122 ms, decisions/055). The result is under 2 KB. A
miss is at most once per league per 15 minutes; it is measured again inside
Railway before review and written down. Across ten seeds a printed chance
moved by up to 2,4 points, so the figures carry about a point of noise, and
the constant seed keeps them still while the data is.

## Measured

On production, read-only, on 2026-10-12, v1.14.1 deployed; all three models
computed in memory.

**The simulation, judged.** 24 finished football-data league seasons (2023 to
2025; three left out for a missing match), each simulated from a quarter, a
half and three quarters of the way through, against how it ended:

| From | Model | Final points RMSE | Champion Brier | Top 3 Brier | Bottom 3 Brier |
|---|---|---|---|---|---|
| 25 % | Elo | 10,57 | 0,5432 | 0,0476 | 0,0954 |
| | Poisson | 9,48 | 0,4567 | 0,0436 | 0,0933 |
| 50 % | Elo | 7,28 | 0,3499 | 0,0340 | 0,0676 |
| | Poisson | 6,57 | 0,3347 | 0,0289 | 0,0638 |
| 75 % | Elo | 4,49 | 0,2706 | 0,0285 | 0,0413 |
| | Poisson | 4,27 | 0,2779 | 0,0256 | 0,0402 |

A team new to its league, a quarter of the way in: Elo expected 5,2 points
too many on average, Poisson 1,3. No TASO season was simulated this way.

**Ties.** Poisson with scorelines drawn and ties by goal difference, against
Poisson with ties by the current order, over all 72 cuts: points RMSE 7,10
both, champion Brier 0,3573 against 0,3564, and 157 ms against 89 ms for the
Championship. In one race it moves a figure: HJK's title chance was 12,1 %
against 7,8 %.

**Draws.** Where Elo makes one side a 75 to 85 % favourite, football-data's
707 such matches were drawn 15,8 % of the time; Elo said 25,7 %, Poisson
17,3 %. TASO's 540: 8,9 %, 18,5 % and 10,8 %.

**Per match**, the matches all three models predicted: Poisson's Brier is
below Elo's in all ten domestic competitions and seven of the nine foreign
leagues; Elo's is lower in the Championship (0,6388 against 0,6423) and
Série A (0,6240 against 0,6261).

## Security & Secrets

No new environment variable or secret.

## Logging

The feature only reads. A failed read of the table or of the fit is already
logged by its own service.

| Event | Level | The line |
|---|---|---|
| The simulation, or a read it makes, throws | `error` | `Unable to simulate the season`, with the provider, the competition's code, the season id and the error |

Nothing at `info`: a page view is not an event, and the cache's own failures
are logged by the cache. No personal data: the line carries no user id.

## Acceptance Criteria

- [ ] Signed in, a covered single-table league's standings page in the season in progress shows `Kauden ennuste` first in `Tämä kausi`: per team its expected points and chance of first, top three and bottom three
- [ ] Each remaining fixture is drawn from `poisson-v1`'s probabilities with one fit, 10 000 times, from a constant seed; ties go to the current order
- [ ] After a split each group is its own table with points carried over, showing first and last place; the first-place column is `Mestaruus` in a group named `Mestaruussarja` and `Sarjan voitto` in any other
- [ ] On seeded data, a league that split last season and has no continuation group yet shows expected points and `Runkosarjan voitto` only, with the regular-season line
- [ ] `0 %` and `100 %` appear only when decided; `< 1 %` and `> 99 %` otherwise
- [ ] A postponed fixture is simulated; a cancelled, awarded or abandoned one and a play-off match are not
- [ ] A group with no fixture left is shown beside one that has; a pass-through group is not shown
- [ ] The Champions League, the cups and finished seasons have no panel
- [ ] A failed run shows the Finnish failure line and logs one `error` line; signed out, no figure is in the HTML
- [ ] The panel links to `/ennusteet` filtered to its competition
- [ ] No provider request of its own; cached 15 minutes; its cost inside Railway measured and written down
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/season-simulation.test.ts` | A run by hand with a fixed seed; points and ranking; ties by current order; first, last, top three and bottom three; impossible and decided places; a group with no fixture; a fixed seed's repeatability |
| `tests/unit/lib/…service….test.ts` | The table and fixtures read; S13's statuses and S14's stages; a pass-through group left out; before a split; the cache; failure and its log line |
| `tests/unit/components/…` | The panel first in `Tämä kausi`; the three column sets; `Mestaruus` against `Sarjan voitto`; rounding with `< 1 %` and `> 99 %`; the link; every Finnish line |
| `tests/e2e/…` | Signed in, a league in progress shows the panel; signed out, none |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/061-season-simulation.md` (this file)
- A pure simulation module, its service, the competition analytics section
- `decisions/061-season-simulation.md`, by the implementing agent

## Open Questions

**None.** Q1–Q12 were answered on 2026-10-01; the revision of 2026-10-12 and
its three strings (`Sarjan viimeinen sija`, `> 99 %`, and the line for a
season with no simulated table) were confirmed in chat that day.

#517 (knockout simulation) and #518 (competition zones) were filed from S6
and S8; #518 now also carries the chance of the upper group before a split
(S5).
