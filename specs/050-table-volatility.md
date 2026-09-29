# 050 — Table volatility: how much a league's table moves after mid-season

> **Status: draft, 2026-09-29. Open questions Q1–Q11 below are unanswered — not
> ready for the go.** Written for #342, the last of the competition-level
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

- One panel on a competition's standings page, in `Analyysit` (specs/048 S4) —
  which group depends on Q1.
- Completed seasons only (S3).
- Both providers, each competition within its own source (S2).

### Out of scope

- Any single team's movement on the team page — `Sijoitus kierroksittain`
  (specs/030) already shows it round by round.
- A list of the season's biggest risers and fallers — a later feature if wanted
  (Q10 asks whether it belongs here after all).
- Anything about the season in progress (S3).
- Goals per game (specs/048), home advantage and draws (specs/049).

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Where positions come from | **The same ranking the standings page uses for that round** — `calculateStandings` and the TASO path's equivalent, with the season's group rows (specs/030 D) | specs/030's property: a position here always equals the one the standings page shows for that round. A second ranking would let the two disagree. |
| S2 | Providers | **Each competition within its own registry**, never a figure mixing football-data and TASO seasons | specs/026, specs/027, specs/048 S2. |
| S3 | Which seasons | **Completed seasons only** | "Final position" does not exist before a season ends. The season in progress is not a point, a row or a part of any average here. |
| S4 | No provider request | **Stored data only** | specs/048 S9: production is backfilled, and a completed season never refreshes (`needsRefresh`). |

## Open questions

Each carries a recommendation; none is decided until answered in chat.

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | **Shape: across seasons, or across competitions?** | (a) A line over this competition's completed seasons, one point per season — in `Kausi kaudelta`, beside specs/048's goals per game. (b) A table of every competition's figure over a window, this one highlighted — in `Kilpailut rinnakkain`, beside specs/049. (c) Both | **(a).** "Is this league getting less predictable?" is answered within one competition, where league size rarely changes between seasons — so the raw measure (Q2) stays fair. Comparing competitions (b) means comparing 10-team and 20-team tables, which needs a normalised measure a reader has to have explained. |
| Q2 | **The measure** | (a) **Mean absolute change**: the average over the season's teams of \|final position − mid-season position\|, e.g. `2,1 sijaa`. (b) The same, **divided by the number of teams**, as a share of the table. (c) **Rank correlation** between the two tables (Spearman), 1 = unchanged | **(a)** under Q1 (a): "teams moved 2,1 places on average" needs no explanation. Under Q1 (b), (b) instead — (a) would rank every 20-team league as more volatile than every 12-team one for size alone. (c) is the textbook measure, but a reader cannot check it by eye. |
| Q3 | **Which point is "mid-season"** | (a) After the round that completes **half the season's rounds**, rounded up — `⌈R / 2⌉`, R counting every round a team plays, the continuation after a split included (Veikkausliiga's 22 + 5 → after round 14). (b) Half of the **regular season** only (Veikkausliiga → round 11). (c) After the first half of the calendar — the summer break, or the winter break for autumn–spring leagues | **(a).** "Halfway through the season" as a reader means it, and it lands inside the regular season in every league here, where specs/030 has a per-round table. specs/038 S9's "same share of the season completed" is the same idea. |
| Q4 | **Final position after a split** | (a) The **combined** position — a championship-group team above every relegation-group team, as specs/030 rule B combines them. (b) The position within the team's own group | **(a).** The final table a reader knows is the combined one; (b) would say a team finishing 1st of the relegation group moved from 9th to 1st. |
| Q5 | **Seasons where the table cannot be computed** — specs/030 rule C: some TASO seasons have no per-round table (the standings page shows no round selector), mostly old ones | (a) That season has no point, and the too-few rule (Q7) applies to what is left. (b) Use the final table for both and skip only the mid-season read — not possible, since the mid-season position *is* a per-round table | **(a),** with a line under the chart naming how many seasons had to be left out — to word under Q11. |
| Q6 | **Which competitions** | (a) specs/048 S5's leagues **without the Champions League**: its 2023/24 edition had eight groups and knockouts, and from 2024/25 a 36-team league phase of eight rounds followed by knockouts — no "final position" for most teams. (b) The same list as specs/048, Champions League included | **(a).** Kakkonen's parallel pools (specs/030 rule E) are in: each pool is its own table, and a pool's teams count like any others. |
| Q7 | **Too few seasons** | (a) A line needs two completed seasons with a point, as specs/048 S10, with its own message — proposed `Taulukon vaihtelu näytetään, kun kilpailusta on vähintään kaksi päättynyttä kautta.` (b) A higher minimum | **(a).** football-data's leagues have three completed seasons today (2023/24–2025/26; `BSA` 2023–2025), TASO's up to eleven. |
| Q8 | **A team in one of the two tables but not the other** — a team withdrawing mid-season, or results annulled | (a) Counted over the teams present in both tables only. (b) The season has no point | **(a).** One withdrawal should not erase a season; the team count behind each point is stated in the text alternative. |
| Q9 | **The page's selected season** | (a) Its point marked, as specs/048 S11. (b) Not marked | **(a)** for consistency with specs/048 — and where the selected season is the one in progress (S3), nothing is marked. |
| Q10 | **The teams behind the number** | (a) The figure only. (b) Also the season's biggest riser and faller in the text alternative, e.g. `suurin nousu: HJK 7. → 1.` | **(a)** for this spec; (b) is a nice line but a second feature on the panel. Stated here so it is a choice, not an omission. |
| Q11 | **The strings** | Proposed: panel `Taulukon vaihtelu`; axes `Kausi` and `Sijoja keskimäärin`; text-alternative row `Kausi 2024: joukkueiden sijoitus muuttui kauden puolivälistä loppuun keskimäärin 2,1 sijaa (12 joukkuetta).`; under the chart `Kauden puoliväli on kierroksen 14 jälkeen.`-style line naming the round per season, or a general one: `Puoliväli: kun puolet kauden kierroksista on pelattu.`; seasons left out: `1 kausi puuttuu, koska sen kierroskohtaisia taulukoita ei voida laskea.`; failure `Taulukon vaihtelua ei voitu laskea. Yritä myöhemmin uudelleen.` | Confirm or correct. |

## UX / UI (Finnish strings)

**Pending Q1, Q9, Q11.** Under the recommendations, signed in, on the standings
page of a competition Q6 names:

1. `Analyysit`
2. `Kausi kaudelta` — specs/048's group
   - `Maaleja ottelua kohden` — specs/048
   - **`Taulukon vaihtelu`** — new panel
     - A line chart (`LineChart`, specs/030), one point per completed season
       with a computable table (Q5), oldest left; the selected season marked
       (Q9)
     - Axes `Kausi` and `Sijoja keskimäärin`, from 0; values to one decimal with
       a decimal comma
     - A text alternative, one row per season, with the team count (Q8)
     - Under the chart: what "mid-season" means (Q3), and any seasons left out
       (Q5)
3. `Kilpailut rinnakkain` — specs/049's group, unchanged

Signed out: the one `Analyysit` prompt (specs/048 S4).

## API & Data

**No new column, no provider request** (S4).

| Needed | Where |
|---|---|
| A completed season's matches, every team's | The season read the standings page uses — football-data `getSyncedSeasonMatches`, TASO the stored season with its group rows (specs/030 D) |
| The mid-season and final tables | `calculateStandings` / the TASO path's equivalent, twice per season (S1) |
| Which TASO seasons have per-round tables, and the combined position after a split | specs/030's rules B, C and E, as `position-series.ts` applies them |
| The chart | `LineChart` |
| Signed in | `canSeeAnalytics()`, before any read |

**Caching:** to decide from measurement — see Performance. A completed season's
figure never changes, so if one is needed it has no invalidation problem.

## Edge Cases

Only those that do not depend on an open question.

| Case | Behaviour |
|---|---|
| The season in progress | No point (S3) |
| A season whose stored matches are incomplete | Computed from what is stored, as the standings page would show it — no correction |
| A points deduction | Counted as the standings page counts it (S1, specs/030 D) |
| A match with no round (`matchday === null`) | In no per-round table, as specs/003 — so not in the mid-season table; in the final table as the standings page counts it |
| A read fails | The failure message (Q11); the rest of the page renders |
| Signed out | No figure in the HTML (specs/048 S4) |

## Performance & Limits

**To measure before the go, or at the start of implementation.** Per page view,
one season read per completed season — up to eleven for Veikkausliiga — and two
tables per season. specs/030 measured one table at well under a millisecond, so
the tables are nothing; the reads are the cost. Options if they show: one read
for all seasons at once, or caching the per-season figure, which never changes
once a season is complete.

## Security & Secrets

No new environment variable or secret. Behind `canSeeAnalytics()`.

## Acceptance Criteria

Drafted against the recommendations; revised once the open questions are answered.

- [ ] Signed in, the standings page of every competition Q6 names shows
      `Taulukon vaihtelu` in `Kausi kaudelta`, after `Maaleja ottelua kohden`
- [ ] One point per completed season; the season in progress has none
- [ ] Each point is the mean over the season's teams of |final − mid-season
      position|, both positions exactly those the standings page shows for
      those rounds
- [ ] Mid-season is after round ⌈R / 2⌉; after a split, the final position is
      the combined one
- [ ] A season without per-round tables has no point, and the page says how
      many were left out
- [ ] Fewer than two points: the Finnish too-few message in place of the chart
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
