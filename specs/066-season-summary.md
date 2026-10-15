# 066 — Kausi lyhyesti: a team's season in up to three sentences

> **Status: S1–S7 were decided by Miikka in #356's comments on 2026-10-12,
> S8–S11 and the rules R1–R5 in chat on 2026-10-14, and the spec confirmed that
> day. Strings may be fine-tuned during implementation.** Written for #356. Every sentence is a
> headline over a number an existing panel already shows: templates, not a
> language model (S1).

## Summary

A team page's `Analyysit` holds a dozen panels, and the most notable thing
about a season can be one cell in one of them. This puts up to three Finnish
sentences first in `Analyysit`, each stating one fact the stored seasons
support: the best or worst home or away record in years, a run that is a club
record, the season's biggest upset win. A quiet season gets one sentence, or
no block.

## Scope

### In scope

- A block `Kausi lyhyesti`, first in a club's team page `Analyysit`, for its
  most recent league season (S2, S6, S9).
- Four facts: the home record, the away record, a run that is a club record,
  and the season's biggest upset win (S4).
- Their ranking and the cap of three (S3, S11, R5).

### Out of scope

- A language model, now or as a later layer of this feature (S1).
- Cup seasons and national teams (S6), and past seasons (S9).
- The clean-sheet and position facts: the first follow-ups (S7).
- A run still going on: the sentence states its length, not that it continues.
- An upset defeat: only the team's own wins are upsets here (S4).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Templates or a language model | **Templates.** Each sentence is fixed copy around a number already computed | Miikka, 2026-10-12: "confirmed". A model would add per-render cost, a key and a cache, and could assert a result that never happened, in Finnish, on a site where every figure is checkable. |
| S2 | Where | **First in `Analyysit` on the team page: a group of its own, headed `Kausi lyhyesti`, above `Ottelu ottelulta`. Signed in only, as every analytic (`canSeeAnalytics()`)** | Miikka, 2026-10-12: "yes, first". `skills/write-spec.md` asks a new panel to name its group; this one is its own group, so the block needs no second heading. |
| S3 | Favourable facts only, or both | **Both.** `Heikoin kotisaldo` is shown as readily as `Paras kotisaldo`. **Favourable facts come first** | Miikka, 2026-10-12: "mixed", then "mixed: good first". |
| S4 | The first version's facts | **The home record, the away record, a run that is a club record, the season's biggest upset win** | Miikka, 2026-10-12: "they could be the first set". |
| S5 | At least three seasons | **A fact needs at least three stored seasons to compare the selected season against** | Miikka, 2026-10-12: "your rule is fine". |
| S6 | Which seasons and teams | **League seasons of clubs, both providers. A season in progress says so once, `Kausi 2026 (kesken)`, and shows nothing until five matches are played** | As S5. |
| S7 | Splitting | **This issue carries the first version; follow-up issues carry the clean-sheet and position facts, most likely in the same release** | Miikka, 2026-10-12: "It can be split". |
| S8 | The seasons compared | **The club's stored seasons in the same competition, before the selected one** | Miikka, 2026-10-14: "Same competition only (Recommended)". A record from another division is a tier effect, not a season's form. football-data stores seasons from 2023, so its clubs reach S5's three only from 2026/27. |
| S9 | Which season gets a block | **The club's most recent stored league season only**: the season in progress, or in the winter the one just finished | Miikka, 2026-10-14: "Most recent only (Recommended)". The run record is then the one `Ennätykset` shows, so every sentence can be checked against a panel. |
| S10 | The upset | **The team's own win in the selected season with the lowest probability Elo's backtest row gave it (specs/057), shown only below 25 %.** None in the competition's first stored season, as specs/057 | Miikka, 2026-10-14: "Under 25 % (Recommended)". Without a threshold a strong side's "biggest upset" is a 45 % win. |
| S11 | A block of unfavourable facts only | **Not capped: up to three, as any block** | Miikka, 2026-10-14: "No cap (Recommended)". A season worst at home, worst away and with a record losing run reads as it was. |

## Rules

Confirmed by Miikka, 2026-10-14: R2's five home and five away matches "Yes,
five per side (Recommended)"; R1, R3, R4 and R5 "As drafted (Recommended)".

| # | Rule | Choice |
|---|---|---|
| R1 | "Beats" | The selected season's figure, rounded as `Koti- ja vierastilastot` shows it (two decimals; Miikka, 2026-10-15), is **strictly** better (or, for a worst, strictly worse) than each earlier season's, rounded the same way. A season it only equals stops the count |
| R2 | The home and away figure | Points per match, `pointsPerMatch` of specs/033. **At least five home (or away) matches in the selected season**, on top of S6's five played |
| R3 | N in the sentence | The selected season and every earlier compared season it beats in a row, newest first. `N` is at least four, by S5. If it beats every compared season, the sentence says `tallennetuilla kausilla` instead of a count |
| R4 | A run record | specs/039's record for a kind, over the club's league seasons, whose run ends in the selected season, so the sentence agrees with `Ennätykset`. A run equal to the record counts when `Ennätykset` names it: specs/039 S7 gives a tie between two spells to the most recent, while inside one spell the first is named (Miikka, 2026-10-15: follow `Ennätykset`). One run per direction: `wins` before `unbeaten`, `defeats` before `winless` |
| R5 | Ranking | Favourable first (S3). Within a direction: the fact beating more seasons first; a run record counts as beating all of them; on equal counts the run, then home, then away; the upset last. Then the first three |

## UX / UI (Finnish strings)

On a club's team page, signed in, for its most recent league season (S9),
first in `Analyysit` (S2):

`Kausi lyhyesti` — the group's heading.

`Kausi 2026 (kesken)` — under the heading, once, when the season is in
progress (S6). The season's own label: `Kausi 2025/26 (kesken)` for a
football-data season.

Then one to three sentences, a paragraph each, in the order of R5:

| Fact | Sentence |
|---|---|
| Home, best | `Paras kotisaldo 5 kauteen: 2,38 pistettä ottelua kohden.` |
| Home, worst | `Heikoin kotisaldo 5 kauteen: 0,83 pistettä ottelua kohden.` |
| Away, best | `Paras vierassaldo 5 kauteen: 1,94 pistettä ottelua kohden.` |
| Away, worst | `Heikoin vierassaldo 5 kauteen: 0,57 pistettä ottelua kohden.` |
| Home or away, beats every compared season (R3) | `Paras kotisaldo tallennetuilla kausilla: 2,38 pistettä ottelua kohden.` (and `Heikoin`, `vierassaldo` likewise) |
| Run record, wins | `Seuran pisin voittoputki tallennetuilla kausilla: 9 ottelua.` |
| Run record, unbeaten | `Seuran pisin tappioton putki tallennetuilla kausilla: 14 ottelua.` |
| Run record, defeats | `Seuran pisin tappioputki tallennetuilla kausilla: 6 ottelua.` |
| Run record, winless | `Seuran pisin voitoton putki tallennetuilla kausilla: 11 ottelua.` |
| The upset | `Kauden suurin yllätys: voitto ottelussa KuPS – AC Oulu, jolle Elo antoi 16 %.` |

- The team is never named: it is the page's subject. The opponent appears only
  in the match's own `A – B`, which needs no case ending.
- Numbers as digits; points per match with two decimals and a comma, as the panel prints it
  (`formatDecimal`); the percentage whole with a no-break space (`percentText`),
  `Elo antoi` as specs/057 writes it.
- The upset's match label links to the match page, as specs/057's list does.

| String | When |
|---|---|
| `Kauden yhteenvetoa ei voitu laskea. Yritä myöhemmin uudelleen.` | A read failed |

No block, and nothing said, when no fact qualifies, when the season has fewer
than five played matches, or when the page is a cup season or a national team.

## API & Data

**No new table, no provider request.**

| Needed | Where |
|---|---|
| The club's seasons | `getTeamSeasons(source, teamProviderId)`, filtered to the selected season's competition (S8) |
| Home and away per season | `homeAwayStats` and `pointsPerMatch` (specs/033) over each season's finished matches, read with the season readers specs/038 uses (`readSeasonFor`, `readTasoSeason`) |
| The run record | `recordsFor` of specs/039 (`streak-records.ts`); the fact holds when the record's span ends in the selected season |
| The upset | specs/057's backtest rows (`elo-v1`, `kind = "backtest"`) for the competition-season, narrowed to matches the team won; a new team filter beside `getSeasonSurprises` |
| Ranking and sentences | A pure module: one detector per fact returning a fact or nothing, and a ranking (R5). The templates sit beside the block's component, whose formatters they print with |
| Access | `canSeeAnalytics()`, checked once by the section as today |

**Caching:** nothing new. specs/033, 038 and 039 cache nothing; the reads are
the ones `Tämä kausi verrattuna` and `Ennätykset` already make on the same
page, shared through React's `cache()`, so the block adds no query of its own
except the upset's.

## Edge Cases

| Case | Behaviour |
|---|---|
| Fewer than three earlier seasons in the competition (S5, S8) | No home, away or run fact |
| A season in progress with fewer than five played matches (S6) | No block |
| Fewer than five home matches, five away (R2) | No home fact, no away fact |
| The selected figure equal to an earlier season's as printed (R1) | The count stops there; under four, no fact |
| Best of every compared season (R3) | `tallennetuilla kausilla` |
| A run record equal to the earlier record (R4) | Shown when `Ennätykset` names the selected season: a tie with an earlier spell's record, not one inside the same spell |
| Both a winning and an unbeaten record | The winning run only (R4) |
| A record run that started in an earlier season | Shown: its span ends in the selected season (R4) |
| No win below 25 % (S10) | No upset fact |
| The competition's first stored season | No upset fact (specs/057) |
| An upset won on penalties | Not an upset: a shoot-out is a draw for every model (specs/057) |
| A competition Elo does not predict | No upset fact |
| Four favourable facts | The first three of R5; the upset drops |
| Three unfavourable facts and no favourable one | Three sentences (S11) |
| No fact | No block |
| A past season selected (S9) | No block |
| A cup season, a national team (S6) | No block |
| One read fails | The failure line in place of the sentences |
| Signed out | No sentence in the HTML |

## Performance & Limits

The block reads what `Tämä kausi verrattuna` and `Ennätykset` already read on
the same render, so its cost is the detectors over a few seasons in memory and
one query for the upset. The implementing agent measures the page's render time
on a TASO club with the most stored seasons, before and after, and writes it in
the decision record.

## Security & Secrets

No new environment variable or secret.

## Logging

The feature only reads. A failed season read is already logged by its service.

| Event | Level | The line |
|---|---|---|
| A detector, or a read it makes, throws | `error` | `Unable to summarise the season`, with the provider, the team's provider id, the competition's code, the season id and the error |

Nothing at `info`: a page view is not an event. No personal data: the line
carries no user id.

## Acceptance Criteria

- [ ] Signed in, a club's most recent league season shows `Kausi lyhyesti` first in `Analyysit`, above `Ottelu ottelulta`, with one to three sentences
- [ ] Each sentence's number equals the figure in the panel it comes from: `Koti- ja vierastilastot`, `Ennätykset`, or the match's own Elo figure
- [ ] On seeded seasons: a home record better than the four seasons before it says `Paras kotisaldo 5 kauteen`, and a worse one `Heikoin`; one that beats every compared season says `tallennetuilla kausilla`
- [ ] A season with fewer than three earlier seasons in its competition shows no home, away or run fact
- [ ] A season in progress says `(kesken)` once and shows nothing before five played matches
- [ ] Favourable facts come before unfavourable ones; never more than three sentences
- [ ] A run record ending in the selected season is stated; one ending earlier is not
- [ ] The upset is the team's own win with the lowest Elo probability, under 25 %, linked to its match
- [ ] A cup season, a national team and a past season show no block; signed out, no sentence is in the HTML
- [ ] A failed read shows the Finnish failure line and logs one `error` line
- [ ] The page's render time on the TASO club with the most seasons is measured before and after, and written down
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/season-summary.test.ts` | Each detector at its boundary: three and two earlier seasons; equal as printed stopping the count; four and five home matches; a run record ending in and before the season; a tie with the record; wins over unbeaten; the upset at 24 % and 25 %; the first stored season; the ranking, favourable first, the cap |
| `tests/unit/components/season-summary-section.test.tsx` | Every template as an exact string, both directions, `tallennetuilla kausilla`, a football-data season label |
| `tests/unit/lib/surprise-service.test.ts` | The team filter: only the team's wins, its competition-season |
| `tests/unit/components/…` | The group first in `Analyysit`; `(kesken)` once; no block for a cup, a national team, a past season; the failure line; the upset's link |
| `tests/e2e/…` | Signed in, a seeded club season shows the block and its numbers match the panels; signed out, none |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/066-season-summary.md` (this file)
- A pure module for the detectors and the ranking; its service; the block's component, which holds the sentences; `analytics-section.tsx`
- `decisions/066-season-summary.md`, by the implementing agent

## Open Questions

**None.** Q1–Q6 of the first draft were answered in chat on 2026-10-14: Q1,
Q2, Q3 and Q5 are recorded as S8–S11, Q4 and Q6 as the rules R1–R5.
