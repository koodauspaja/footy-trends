# 048 — Goals per game across a competition's seasons

> **Status: agreed in chat on 2026-09-29 (Q1–Q12); #341 moved to Ready the same
> day.** Written for #341, the first of the competition-level analytics
> (#339–#342). Being first, it also creates the competition page's `Analyysit`
> section, which #339, #340 and #342 then join (the shared note on all four
> issues).

## Summary

Is Veikkausliiga getting more attacking? This answers it with one line: a
competition's goals per game in each stored season, so a reader sees whether its
scoring is rising, falling or flat, and how this season compares so far.

Every figure it needs is already stored — both providers keep each match's final
score. What is new is reading a competition **across** its seasons rather than
one at a time, and giving the competition's standings page an `Analyysit`
section to put that in.

## Scope

### In scope

- One chart on a competition's standings page: goals per game, one point per
  stored season (S3).
- The standings page's first `Analyysit` section: its heading, its sign-in gate
  and its first group, `Kausi kaudelta` (S4).
- The competitions S5 names — football-data's leagues and the Champions League,
  TASO's leagues — each within its own source (S2).

### Out of scope

- The domestic cups — `Miesten Suomen Cup`, `Naisten Suomen Cup`, `Liigacup`,
  `Ykkösliigacup` — and the TASO national-team pages, Huuhkajat and Helmarit
  (S5).
- The World Cup and the European Championship: one stored edition each, so no
  line to draw (S5, S10).
- Comparing one competition with another — #339 and #340 are the comparisons.
- Home and away goals as separate lines — home advantage is #339.
- Table volatility — #342.
- Any per-team figure; the team page already has `Maalit` (specs/032).
- Half-time scores, and anything about *when* goals were scored.

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | What "goals per game" is | **A season's total goals, home and away together, over its number of matches**, among finished matches with both scores stored | A season's own average, not a mean of per-round averages, so every match weighs the same. The same "finished, both scores" rule every panel uses (specs/042 S3). |
| S2 | Providers | **Each competition within its own registry**; never a line mixing football-data and TASO | specs/026, specs/027. A TASO competition spanning several category ids is one competition through the registry, as specs/044 counts it. |
| S3 | Which page | **The competition's standings page (`…/sarjataulukko`), under the tables** | Miikka, 2026-09-29 (Q1). Where a competition is read as a whole, and one place for #339–#342 to join. |
| S4 | The section and its group | **`Analyysit`, with the team page's rules** — one heading, the gate asked first, one `Kirjaudu sisään nähdäksesi analyysit ja trendit.` signed out (specs/030, specs/031) — **and one group, `Kausi kaudelta`**, holding this panel | Miikka, 2026-09-29 (Q2). #339, #340 and #342 join this group or add one beside it. The group heading shows even while it is the only group, as `Analyysit` does on the team page. |
| S5 | Which competitions | **football-data: `PL`, `ELC`, `FL1`, `BL1`, `SA`, `DED`, `PPL`, `PD`, `BSA` and `CL`. TASO: `VL`, `M1L`, `M1`, `M2`, `NL`, `N1`, `P21SM`, `P211`, `P18SM`, `T18SM`.** No section on any other competition's page | Miikka, 2026-09-29 (Q3, then Q8). The domestic cups and the TASO national teams are out by choice. The World Cup and the Euro were in, and then out: each has one stored edition (`WC` from 2026, `EC` from 2024), and a line needs two (S10). |
| S6 | Which matches in a season | **Every stored finished match of the competition-season**, playoffs and qualifiers included; for the Champions League, every stage | Miikka, 2026-09-29 (Q4). The competition's goals are all its matches' goals. Differs on purpose from specs/031, whose `Vire` counts only table matches. |
| S7 | The season in progress | **Shown, labelled `(kesken)`,** over the matches played so far | Miikka, 2026-09-29 (Q5). "This season so far" is what a reader most wants set against the past. |
| S8 | A season with few matches | **A season's point is drawn once it has at least five finished matches**; below five it has no point | Miikka, 2026-09-29 (Q6): the same five as the other trends (`FORM_WINDOW`, specs/031). In practice this only ever bites the season in progress, in its first round or two. What the reader is told about it is S14. |
| S9 | Seasons not stored | **Stored seasons only; no provider request.** A season not in the database is absent. Under the chart: `Perustuu tallennettuihin kausiin.` | Miikka, 2026-09-29 (Q7). Production was backfilled for every competition-season (`docs/setup/022`), so in practice nothing is missing there. |
| S10 | Too few seasons | **The line is drawn from two seasons with a point** (S8). With fewer: `Maaleja ottelua kohden kausittain näytetään, kun kilpailusta on tallennettu vähintään kaksi kautta.` in place of the chart | Miikka, 2026-09-29 (Q8). football-data's leagues reach back to 2023 and the Champions League offers three seasons (`docs/setup/022`); TASO's leagues go back to 2015. |
| S11 | The page's selected season | **Its point is marked** on the line | Miikka, 2026-09-29 (Q9). Ties the chart to the table above it. The line itself is the same whichever season is selected. |
| S12 | The strings | As proposed — see UX / UI | Miikka, 2026-09-29 (Q11). |
| S13 | The y-axis | **Zoomed to the competition's own data**: from the nearest 0,5 below its lowest season to the nearest 0,5 above its highest, ticks labelled — e.g. `2,5`–`3,5` for the Premier League and La Liga, `2,0`–`3,5` for Veikkausliiga | Miikka, 2026-09-29 (Q10): *"whatever the actual data suggests, the epl, veikkausliiga and laliga at least"*. Measured on production: La Liga 2,62–3,04 over four seasons, Premier League 2,75–3,28 over four, Veikkausliiga 2,26–3,29 over twelve. From 0, La Liga's whole range fills 12 % of the chart and its 2025→2026 rise 10 % — a flat line in exactly the competitions named. The reader's question is whether goals are rising or falling, so the change is the content; a line, unlike a bar, does not need a zero baseline, and the labelled ticks say where it starts. |
| S14 | A season with no point (S8) | **A sentence under the chart**: `Kausi 2026 näytetään, kun siitä on pelattu vähintään viisi ottelua.`, only when a season is left out | Miikka, 2026-09-29 (Q12). A reader who has just picked that season otherwise sees no mark and no reason. |
| S15 | Where `(kesken)` shows | **On a second line under the season's x-axis tick** — the tick reads `2026`, `(kesken)` beneath it — and in the text alternative's row | Miikka, 2026-09-29, asked during implementation: S7 did not say where, and on Veikkausliiga's twelve seasons `2026 (kesken)` as one tick label would overlap its neighbours at 375 px. The chart's bottom margin grows for this chart only. |
| S16 | Season labels on a phone | **Below `sm`, every other season labelled, counting back from the latest, when the labels would touch;** every season labelled from `sm` up. Every season is still a point, and in the text alternative. A last label or note wider than the chart's margin pulls the plot in, so it is never clipped | Miikka, 2026-09-29, asked during implementation: measured on Veikkausliiga's twelve seasons at 375 px, each label needs about 46 of the 46 units a season gets, and `(kesken)` under the last ran off the drawing. |

## UX / UI (Finnish strings)

Signed in, on the standings page of a competition S5 names, under the tables:

1. `Analyysit` — section heading
2. `Kausi kaudelta` — group heading
3. `Maaleja ottelua kohden` — panel heading
   - A line chart, `LineChart` from specs/030: one point per stored season with
     at least five finished matches (S8), oldest left
   - The selected season's point marked (S11); the season in progress labelled
     `(kesken)` on a second line under its tick (S7, S15); on a phone, a long
     line labels every other season (S16)
   - Axes `Kausi` and `Maaleja / ottelu`; values to one decimal with a decimal
     comma; y-axis zoomed to the competition's range, to the nearest 0,5 (S13)
   - Text alternative, one row per season:
     `Kausi 2024: 2,8 maalia ottelua kohden, 162 ottelua.`
   - Under the chart: `Perustuu tallennettuihin kausiin.` (S9)

| String | When |
|---|---|
| `Maaleja ottelua kohden kausittain näytetään, kun kilpailusta on tallennettu vähintään kaksi kautta.` | Fewer than two seasons with a point (S10) |
| `Maalikeskiarvoja ei voitu laskea. Yritä myöhemmin uudelleen.` | The query failed — the panel convention |
| `Kirjaudu sisään nähdäksesi analyysit ja trendit.` | Signed out: `Analyysit` and this, nothing else (S4) |
| `Kausi 2026 näytetään, kun siitä on pelattu vähintään viisi ottelua.` | A season left out by S8 (S14) — the year is the season's own label |

On a competition S5 does not name, no section at all.

Season labels follow the page's own: `2024` for a calendar-year competition,
`2024/25` for one spanning two years.

## API & Data

**No new column, no provider request.**

| Needed | Where |
|---|---|
| Per season: finished matches with both scores, and their total goals | **New query**: `COUNT(*)`, `SUM(home_goals + away_goals)` grouped by season, over every match of the competition (S6). football-data by `competition_code`; TASO over the registry's category ids for the competition |
| The chart | `LineChart` (specs/030) |
| Signed in | `canSeeAnalytics()`, before the query |

**Caching:** none, as specs/031–047. S6 includes every match, so no per-season
classification of TASO groups is needed — one aggregate query per page view.

## Edge Cases

| Case | Behaviour |
|---|---|
| The season in progress has fewer than five finished matches | No point for it (S8); the S14 sentence under the chart |
| Fewer than two seasons with a point | The S10 message in place of the chart |
| The selected season has no point | No mark; the S14 sentence says why |
| Every season within one 0,5 band (e.g. 2,6–2,9) | The axis still spans at least 0,5, from the band's lower 0,5 to its upper (S13) |
| A season missing from the database | Absent from the line; `Perustuu tallennettuihin kausiin.` (S9) |
| A season with a gap between stored seasons | The line joins the seasons either side; no point is invented for the gap |
| A TASO competition spanning several category ids | One line (S2) |
| A competition renamed between seasons | One line under its current name |
| A playoff, qualifier or Champions League knockout match | Counted (S6) |
| A match decided on penalties | Its score after extra time; a shoot-out is not goals (specs/044) |
| A match with a result but a missing score | Not counted (S1) |
| The query fails | The failure message; the rest of the page renders |
| Signed out | No goals-per-game value in the HTML (S4) |
| A competition S5 does not name — a domestic cup, the World Cup, the Euro, Huuhkajat, Helmarit | No `Analyysit` section |

## Performance & Limits

One aggregate query per page view, grouped by season, over indexed columns: at
most twelve seasons of a few hundred matches each. No provider traffic.

## Security & Secrets

No new environment variable or secret. Behind `canSeeAnalytics()`.

## Acceptance Criteria

- [ ] Signed in, the standings page of every competition S5 names shows
      `Analyysit`, `Kausi kaudelta` and `Maaleja ottelua kohden`, under the tables
- [ ] Each point is the season's total goals over its finished matches with both
      scores — playoffs, qualifiers and every Champions League stage included —
      to one decimal with a decimal comma
- [ ] A season is drawn only from five finished matches; the season in progress
      is labelled `(kesken)`
- [ ] The selected season's point is marked, and the line is the same whichever
      season is selected
- [ ] With fewer than two seasons drawn, the Finnish too-few message shows in
      place of the chart
- [ ] `Perustuu tallennettuihin kausiin.` is shown under the chart
- [ ] Signed out, the page shows `Analyysit` and the one prompt, and its HTML
      carries no goals-per-game value
- [ ] No section on the domestic cups, the World Cup, the Euro, Huuhkajat or
      Helmarit
- [ ] A TASO competition spanning several category ids is one line
- [ ] A failed query shows the Finnish failure message, and the rest of the page
      renders
- [ ] No provider request is made
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

- [ ] The y-axis runs from the nearest 0,5 below the competition's lowest season
      to the nearest 0,5 above its highest, with labelled ticks (S13)
- [ ] A season left out by the five-match minimum is named under the chart:
      `Kausi … näytetään, kun siitä on pelattu vähintään viisi ottelua.` (S14)

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/…goals-per-game….test.ts` | The per-season average from totals; unfinished and score-less matches excluded; seasons in order; the five-match minimum at its boundary; the two-season minimum; the in-progress label |
| `tests/unit/lib/…service….test.ts` | The query per provider; TASO across category ids; playoffs counted; its failure as its own case |
| `tests/unit/components/…competition-analytics….test.tsx` | Section, group and panel headings in order; signed out, one prompt and no value; no section on each excluded competition; the too-few and failure messages; the selected-season mark |
| `tests/integration/…` | The aggregate against the real schema, both providers |
| `tests/e2e/…` | Signed in, on a real league: the chart with a point per stored season; signed out, the prompt |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/048-league-goals-per-game-trend.md` (this file)
- A new pure module for the series, and its query in the relevant service(s)
- `src/components/competition-standings-page.tsx` — the section
- A competition-page `Analyysit` component, shared with #339, #340 and #342
- `decisions/048-league-goals-per-game-trend.md`, by the implementing agent

## Open Questions

**None.** Q1–Q12 were answered in chat on 2026-09-29 and are recorded as S1–S14;
Q10 was settled from production's data as Miikka asked. Where `(kesken)` shows
was asked at the start of implementation and is S15; how a phone labels a long
line was asked after measuring it, and is S16.
