# 032 — Goals scored vs conceded

> **Status: agreed on 2026-09-19 and implemented in PR #417.**

## Summary

Two charts in the team page's `Analyysit` section, each with two lines: the
goals the team scored and the goals it conceded.

- **`Maalit otteluittain`**: per match, over its last five matches, after every
  match from the fifth. Where the form chart (specs/031) shows that results
  changed, this shows why: whether the attack dried up, the defence started
  leaking, or both.
- **`Maalit yhteensä`**: running totals from the first match. The gap between the
  lines is the goal difference, and the last point is the standings table's `TM`
  and `PM`.

The first charts on the specs/030 foundation with two lines.

## Scope

### In scope

- One team, one competition, one season, in `Analyysit` after `Vire
  otteluittain`, following the page's season selector.
- Both providers, football-data.org and TASO. Results only.
- **League format only**, exactly as specs/031 Q2: every table group of a
  league, pass-through included; `match-list` groups (playoffs, cup rounds)
  excluded.
- **Signed-in readers only**, through the `Analyysit` section's existing gate
  and single prompt (specs/031 Q5). No new prompt.
- **A second line on `LineChart`**: two series, told apart by a solid and a
  dashed line, not by colour, with a legend.

### Out of scope

- Goal difference as a line of its own. It is the gap in `Maalit yhteensä`.
- Home and away apart. That is #329.
- Comparing teams, a league average, or expected goals (no such data).
- A window other than five (Q2).

## UX / UI (Finnish strings)

**Where:** the `Analyysit` section, after `Vire otteluittain`: `Maalit
otteluittain`, then `Maalit yhteensä`.

| String | Where | Status |
|---|---|---|
| `Maalit otteluittain` | subheading, rolling chart | settled (Q4) |
| `Maalit yhteensä` | subheading, running-total chart | settled (Q1) |
| `Ottelu` | x-axis label, both charts, as the form chart's | settled (Q4) |
| `Maaleja / ottelu` | y-axis label, rolling chart | settled (Q4) |
| `Maaleja` | y-axis label, running-total chart | settled (Q1) |
| `Tehdyt maalit` | legend, solid line, both charts. The standings table's title for `TM` | settled (Q4) |
| `Päästetyt maalit` | legend, dashed line, both charts. The table's title for `PM` | settled (Q4) |
| `Maalit {n}. ottelun jälkeen: tehdyt {x}, päästetyt {y} ottelua kohden.` | text-alternative row, rolling chart; decimal comma, e.g. `1,4` | settled (Q4) |
| `Maalit yhteensä {n}. ottelun jälkeen: tehdyt {x}, päästetyt {y}.` | text-alternative row, running-total chart | settled (Q1) |
| `Maalit näytetään, kun joukkue on pelannut vähintään viisi ottelua.` | instead of the rolling chart, before the fifth match | settled (Q4) |
| `Kaudella ei ole vielä pelattuja otteluita.` | instead of the running-total chart, before the first match | settled (Q1) |
| `Maaleja ei voitu laskea. Yritä myöhemmin uudelleen.` | instead of either chart, when the data cannot be read | settled (Q4) |

**X-axis, both charts:** the team's matches in kickoff order, the same numbering
as the form chart's. The rolling chart starts at the fifth match, like the form
chart, so their points line up; the running totals start at the first.

**Y-axis, rolling chart: fixed 0 to 5, for every league and season** (Q3). Chosen
from the data below.

**Y-axis, running totals: 0 to the team's own highest total, rounded up to a
whole ten** (Q1). One fixed value cannot serve both a Bundesliga attack with 99
goals and a Veikkausliiga side with 30.

## API & Data

**No new endpoint, no provider request, no new database read.** Both services
already select this team's finished league matches in kickoff order for the
form chart (`getTeamFormSeries`). These charts take the same matches, so the
three charts cannot disagree about which matches count.

**Rolling** (Q1, Q2): after the team's `n`-th match, from the fifth, the goals
scored in that match and the four before it, divided by 5, and the goals
conceded likewise. Read from the team's side of each fixture. Each value is a
multiple of 0.2, so one decimal is exact.

**Running totals** (Q1): after the team's `n`-th match, from the first, all the
goals scored and conceded so far.

**How it is checked.** The last running-total point equals the standings
table's `TM` and `PM`: in `calculateStandings`, in `getStandings` /
`getSeasonStandings`, and on the standings page end to end, for a football-data
team and a TASO team. Every rolling point equals its window's sum over five.

**Caching:** none, as specs/031. One pass over at most ~40 matches.

### The rolling axis, measured (Q3)

Measured on 2026-09-19 from the stored test data: 118 team-seasons, 6,680 rolling
points (scored and conceded). Premier League 2024/25 and 2025/26, Bundesliga
2024/25, Veikkausliiga 2015, 2019, 2020, 2022 and 2025.

| | Premier League | Bundesliga | Veikkausliiga |
|---|---|---|---|
| median point | 1,4 | 1,4 | 1,4 |
| 99 % of points at or below | 3,0 | 3,4 | 3,0 |
| highest point | 3,8 | 4,4 | 4,4 |
| team-seasons with any point above 3 | 8 / 40 | 9 / 18 | 10 / 60 |

A fixed 0–3 would clip a point in 27 of 118 team-seasons; 0–4 in 3; **0–5 in
none**. Averaging 5 takes 25 goals in five matches. No La Liga, Serie A or Ligue
1 season is stored, so they are not in the sample; the Bundesliga, usually the
highest-scoring of the big leagues, is.

If a point ever exceeds 5, it is drawn at the top edge and its text row still
states the true value. The chart never extends above its fixed axis.

## Chart foundation: a second series

`LineChart` draws one series today. This adds a list of series, each with its own
line style:

- **Solid for scored, dashed for conceded**, both in the theme's foreground
  colour (Q5). They differ in shape, not colour, so they read in both themes and
  without colour vision.
- **A legend beneath each chart**, a short sample of each line style with its
  label, the same in both panels.
- The single-series charts (position, form) are unchanged.

## Edge Cases

- **Fewer than five matches:** the rolling chart shows its message; the running
  totals are drawn from the first match.
- **No finished match:** both show their messages.
- **Signed-out reader:** the `Analyysit` prompt, and no goal values in the HTML.
- **Both lines on the same value:** the dashed line lies over the solid; the text
  rows still list both.
- **A 0–0 run:** both rolling lines at 0, on the axis.
- **A rolling value above 5:** at the top edge, true value in the text row (Q3).
- **A match with no round**, **unfinished matches**, **pass-through tables**,
  **cup and knockout pages**, **data that cannot be read:** exactly as
  specs/031.

## Performance & Limits

Unchanged from specs/031: no provider request and no database read added.

## Security & Secrets

No new environment variables. No secrets.

## Acceptance Criteria

- [ ] A signed-in reader on a league team's page sees `Maalit otteluittain` and
      `Maalit yhteensä` in `Analyysit`, in that order, after `Vire otteluittain`
- [ ] `Maalit otteluittain`: two lines, one point each per finished league match
      from the fifth, in kickoff order; each point is that match's and the four
      before it's goals divided by 5, from the team's side of each fixture
- [ ] `Maalit yhteensä`: two lines from the first match; the last point equals
      the standings page's `TM` and `PM` for that team, for at least one
      football-data and one TASO league
- [ ] Scored is solid, conceded dashed; both charts have the legend
- [ ] The rolling y-axis is 0 to 5 for every team; the running-total y-axis is 0
      to the team's highest total rounded up to a ten
- [ ] The rolling chart's points line up with the form chart's matches
- [ ] Text alternatives list both values for every point, the rolling ones with
      decimal commas
- [ ] Fewer than five matches: the rolling message, and the running totals drawn;
      no match: both messages
- [ ] Signed out: no chart, no goal values in the HTML, still one prompt
- [ ] No provider request and no database read added, asserted by tests
- [ ] The position and form charts are unchanged
- [ ] No client-side JavaScript; correct in light and dark themes

## Tests Required

- `tests/unit/lib/goals-series.test.ts` (new): the window arithmetic and running
  totals; the away side read correctly; kickoff order; before the fifth and
  before the first match; the last total equals `calculateStandings`'
  `goalsFor` / `goalsAgainst`.
- `tests/unit/components/charts/line-chart.test.tsx`: two series, a dashed one,
  the legend; one series unchanged.
- Chart, panel, section and service tests as specs/031's.
- `tests/e2e/goals-trend.spec.ts` (new): both charts and legends on a
  football-data team and a TASO team; the last totals against the standings
  page's `TM` and `PM`; signed out.

## Files To Update

- `specs/032-goals-scored-vs-conceded.md` (this file)
- `src/lib/goals-series.ts` (new), the two services, `line-chart.tsx`, two
  charts, two panels, `analytics-section.tsx`, both team pages
- `decisions/032-goals-scored-vs-conceded.md`, written by the implementing agent

## Decisions

Answered by Miikka on 2026-09-19.

| | Question | Answer |
|---|---|---|
| Q1 | What the lines are | Both a rolling five-match average and running totals — *"is it possible to have rolling five-match average AND cumulative totals? if yes, then that (if you think visually ok)"*. As two panels, since their scales differ too much for one chart |
| Q2 | Window | Five |
| Q3 | Rolling y-axis | One value for everything, chosen from data with a focus on top tiers: fixed 0–5 (see *The rolling axis, measured*) |
| Q4 | Strings | As proposed; the running-total strings were added with Q1 and approved with it |
| Q3a | A rolling value above 5 | Drawn at the top edge, its true value in the text row. Proposed in chat as the one addition not yet seen; not objected to — the reply was *"update issue"* |
| Q5 | Telling the lines apart | Solid and dashed in one colour with a clear legend, taking colour vision into account — *"trusting your call here"* |

## Open Questions

None. Every question above is answered.
