# 050 — Table volatility: how much a league's table moves after mid-season

> **Status: all questions (Q1–Q15) answered in chat on 2026-09-29 and
> 2026-09-30, awaiting the go.** Written for #342, the last of the competition-level
> analytics after specs/048 (#341) and specs/049 (#339, #340). It joins the
> competition page's `Analyysit` section that specs/048 creates.

## Summary

Is the table at mid-season already the final table, or does the second half
reshuffle it? This measures, for a competition's completed seasons, how far
teams' final positions ended up from where they stood halfway through — so a
reader can tell a league where mid-season order holds from one where it does not.

Nothing new is stored. Every position already comes from the calculation the
standings page and the team page's `Sijoitus kierroksittain` (specs/030) use; what
is new is reading two tables per season — mid-season and final — for **every**
team, and summarising the difference per competition.

## Scope

### In scope

- One panel on a competition's standings page, in `Analyysit`'s `Kausi kaudelta`
  group (specs/048 S4), after `Maaleja ottelua kohden` (S5).
- Completed seasons only (S3).
- Both providers, each competition within its own source (S2).

### Out of scope

- Any single team's movement on the team page — `Sijoitus kierroksittain`
  (specs/030) already shows it round by round.
- A list of the season's biggest risers and fallers — a later feature if wanted
  (S14).
- Anything about the season in progress (S3).
- Goals per game (specs/048), home advantage and draws (specs/049).
- The Champions League (S10).
- Comparing competitions with each other (S5).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Where positions come from | **The same ranking the standings page uses for that round** — `calculateStandings` and the TASO path's equivalent, with the season's group rows (specs/030 D) | specs/030's property: a position here always equals the one the standings page shows for that round. A second ranking would let the two disagree. |
| S2 | Providers | **Each competition within its own registry**, never a figure mixing football-data and TASO seasons | specs/026, specs/027, specs/048 S2. |
| S3 | Which seasons | **Completed seasons only: every season older than the page's season in progress** — the one specs/048 marks `(kesken)` | "Final position" does not exist before a season ends. The season in progress is not a point, a row or a part of any average here. Miikka, 2026-09-30 (Q12): the page already knows its season in progress, so the two charts in `Kausi kaudelta` agree on which season is still running; a season just finished waits until the next one becomes the season in progress. |
| S4 | No provider request | **Stored data only** | specs/048 S9: production is backfilled, and a completed season never refreshes (`needsRefresh`). |
| S5 | Shape | **A line over this competition's completed seasons, one point per season, in `Kausi kaudelta`** after `Maaleja ottelua kohden` | Miikka, 2026-09-29 (Q1). "Is this league getting less predictable?" is answered within one competition, where league size rarely changes between seasons, so the raw measure (S6) stays fair. Comparing 10-team with 20-team tables would need a normalised measure. |
| S6 | The measure | **Mean absolute change: the average over the season's teams of \|final position − mid-season position\|**, in places, e.g. `2,1` | Miikka, 2026-09-29 (Q2). Needs no explanation, and a reader can check it from two standings tables. Rank correlation was set aside as uncheckable by eye. |
| S7 | Mid-season | **After round ⌈R / 2⌉**, R counting every round a team plays in the league season, the continuation after a split included — Veikkausliiga's 22 + 5 → after round 14 | Miikka, 2026-09-29 (Q3). "Halfway through" as a reader means it; it lands inside the regular season in every league here, where specs/030 has a per-round table. The same idea as specs/038 S9. |
| S8 | Final position after a split | **The combined position**, as specs/030 rule B | Miikka, 2026-09-29 (Q4). The final table a reader knows is the combined one. |
| S9 | Seasons without per-round tables | **No point for that season**; a line under the chart says how many were left out | Miikka, 2026-09-29 (Q5). specs/030 rule C: no per-round table, so no mid-season position. |
| S10 | Which competitions | **specs/048 S5's leagues without the Champions League** — football-data `PL`, `ELC`, `FL1`, `BL1`, `SA`, `DED`, `PPL`, `PD`, `BSA`; TASO `VL`, `M1L`, `M1`, `M2`, `NL`, `N1`, `P21SM`, `P211`, `P18SM`, `T18SM`. Kakkonen's parallel pools (specs/030 rule E): each team's change is measured within its own pool, and the season's one point averages every team across the pools; the team count is the total | Miikka, 2026-09-29 (Q6), and 2026-09-30 for the pools (Q14). The Champions League's group stage (2023/24) and league phase with knockouts (from 2024/25) leave most teams without a final position. No panel on its page. |
| S11 | Too few seasons | **The line needs two completed seasons with a point**; fewer, a message in place of the chart (wording Q11) | Miikka, 2026-09-29 (Q7). As specs/048 S10. football-data's leagues have three completed seasons today. |
| S12 | A team in only one of the two tables | **Counted over the teams in both tables only**; the text alternative states each season's team count | Miikka, 2026-09-29 (Q8). Within one season the teams are fixed — promotion and relegation happen between seasons — so this is only a mid-season withdrawal or annulled results, which Miikka notes is rare. One such case should not erase a season. |
| S13 | The selected season | **Its point is marked**; a selected season in progress has no point, so nothing is marked | Miikka, 2026-09-29 (Q9). As specs/048 S11. |
| S14 | Risers and fallers | **Not shown**; the figure only | Miikka, 2026-09-29 (Q10). A second feature on the panel; a later one if wanted. |
| S15 | The strings | **Panel `Sijoitusten vaihtelu`; axes `Kausi` and `Sijoitusmuutos keskimäärin`**; text-alternative row `Kausi 2024: sijoitus muuttui kauden puolivälistä loppuun keskimäärin 2,1 sijaa (12 joukkuetta).`; under the chart `Puoliväli: kun puolet kauden kierroksista on pelattu.`; seasons left out `1 kausi puuttuu, koska sen kierroskohtaisia taulukoita ei voida laskea.`, and for two or more `2 kautta puuttuu, koska niiden kierroskohtaisia taulukoita ei voida laskea.`; too few `Sijoitusten vaihtelu näytetään, kun kilpailusta on vähintään kaksi päättynyttä kautta.`; failure `Sijoitusten vaihtelua ei voitu laskea. Yritä myöhemmin uudelleen.` | Miikka, 2026-09-29 (Q11): *"is this about position?"* — it is, how much positions change — and *"sijoitusmuutos is better for y-axis"*: the value is places moved, which `Sijoitus keskimäärin` would read as an average position. Heading plural, since it is every team's position. The plural left-out line: Miikka, 2026-09-30 (Q15). |
| S16 | Caching | **None: one read of the competition's completed seasons per page view** | Miikka, 2026-09-30 (Q13), from measurement: on the test database one competition's completed seasons read in about 0,3 ms (Premier League 1 140 rows, Veikkausliiga 852, each one index scan), and specs/030 measured a table at well under a millisecond. As specs/031–049; a completed season's figure never changes, so a cache added later has no invalidation problem. |

## UX / UI (Finnish strings)

Strings as S15. Signed in, on the standings
page of a competition S10 names:

1. `Analyysit`
2. `Kausi kaudelta` — specs/048's group
   - `Maaleja ottelua kohden` — specs/048
   - **`Sijoitusten vaihtelu`** — new panel
     - A line chart (`LineChart`, specs/030), one point per completed season
       with a computable table (S9), oldest left; the selected season marked
       (S13)
     - Axes `Kausi` and `Sijoitusmuutos keskimäärin`, from 0; values to one decimal with
       a decimal comma
     - A text alternative, one row per season, with the team count (S12)
     - Under the chart: what "mid-season" means (S7), and any seasons left out
       (S9)
3. `Kilpailut rinnakkain` — specs/049's group, unchanged

Signed out: the one `Analyysit` prompt (specs/048 S4).

## API & Data

**No new column, no provider request** (S4).

| Needed | Where |
|---|---|
| A completed season's matches, every team's | **One read of the stored matches of every completed season** (S3, S16), with TASO's group rows (specs/030 D). Not `getSyncedSeasonMatches`: it asks the provider for a season with no stored row, which S4 rules out — a season with none has no point |
| The mid-season and final tables | `calculateStandings` / the TASO path's equivalent, twice per season (S1) |
| Which TASO seasons have per-round tables, and the combined position after a split | specs/030's rules B, C and E, as `position-series.ts` applies them |
| The chart | `LineChart` |
| Signed in | `canSeeAnalytics()`, before any read |

**Caching:** none (S16).

## Edge Cases

| Case | Behaviour |
|---|---|
| The season in progress | No point (S3) |
| A season finished, the next not yet the season in progress | No point until the next season becomes the season in progress (S3) |
| A completed season with no stored match | No point, and no provider request (S4) |
| Kakkonen's pools | One point: every team's change within its own pool, averaged across the pools (S10) |
| A season whose stored matches are incomplete | Computed from what is stored, as the standings page would show it — no correction |
| A points deduction | Counted as the standings page counts it (S1, specs/030 D) |
| A match with no round (`matchday === null`) | In no per-round table, as specs/003 — so not in the mid-season table; in the final table as the standings page counts it |
| A read fails | The failure message; the rest of the page renders |
| A season without per-round tables | No point; counted in the left-out line (S9) |
| Fewer than two seasons with a point | The too-few message in place of the chart (S11) |
| A team withdraws mid-season | Counted over the teams in both tables (S12) |
| The selected season is in progress | No point, nothing marked (S3, S13) |
| The Champions League's page | No panel (S10) |
| Signed out | No figure in the HTML (specs/048 S4) |

## Performance & Limits

Measured on 2026-09-30 (S16): per page view, one read of every completed season
— about 0,3 ms in the database for the Premier League's 1 140 rows — and two
tables per season, up to eleven seasons for Veikkausliiga. specs/030 measured a
table at well under a millisecond.

## Security & Secrets

No new environment variable or secret. Behind `canSeeAnalytics()`.

## Acceptance Criteria

- [ ] Signed in, the standings page of every competition S10 names shows
      `Sijoitusten vaihtelu` in `Kausi kaudelta`, after `Maaleja ottelua kohden`;
      the Champions League's page has no such panel
- [ ] One point per completed season; the season in progress has none
- [ ] Each point is the mean over the season's teams of |final − mid-season
      position|, both positions exactly those the standings page shows for
      those rounds
- [ ] Mid-season is after round ⌈R / 2⌉; after a split, the final position is
      the combined one
- [ ] A season without per-round tables has no point, and the page says how
      many were left out
- [ ] Fewer than two points: the Finnish too-few message in place of the chart
- [ ] The selected season's point is marked
- [ ] A team in only one of the two tables is left out of that season's mean,
      and each season's team count is in the text alternative
- [ ] Signed out, no figure in the HTML
- [ ] No provider request is made
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/…table-volatility….test.ts` | The mean absolute change over a small league; the mid-season round for even and odd R; a split season's combined final position; a team in only one table; a season without per-round tables left out |
| `tests/unit/lib/…service….test.ts` | Completed seasons only; positions equal the standings calculation's for those rounds; failure |
| `tests/unit/components/…competition-analytics….test.tsx` | The panel after `Maaleja ottelua kohden`; the too-few and failure messages; the left-out line; signed out, no value |
| `tests/integration/…` | The season reads against the real schema, both providers |
| `tests/e2e/…` | Signed in, on a real league: a point per completed season, and one season's value checked by hand against its standings page at round ⌈R / 2⌉ and at the end |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/050-table-volatility.md` (this file)
- A new pure module for the measure, reusing `position-series.ts`' rules
- The competition-page `Analyysit` component from specs/048 — the panel
- `decisions/050-table-volatility.md`, by the implementing agent

## Open Questions

**None.** Q1–Q11 were answered in chat on 2026-09-29 and are recorded as S5–S15.
Q12 (what "completed" means), Q13 (caching, from measurement), Q14 (Kakkonen's
pools) and Q15 (the plural left-out line) were answered on 2026-09-30 and are in
S3, S16, S10 and S15.
