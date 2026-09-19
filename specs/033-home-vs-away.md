# 033 — Home vs away

> **Status: agreed on 2026-09-19 and implemented (#329).**

## Summary

A chart in the team page's `Analyysit` section comparing the team at home and
away over the season: points, goals scored and goals conceded per match, and
the share of matches won. A reader sees whether a team's season is built on its
home ground, which the table's single row hides. It is the app's first bar
chart: the check, planned since specs/030, that the chart foundation is more than
a line.

## Scope

### In scope

- One team, one competition, one season, in `Analyysit` after `Maalit
  yhteensä`, following the page's season selector.
- Both providers, football-data.org and TASO. Results only; home and away are
  the fixture's own sides.
- **League format only**, exactly as specs/031 Q2 and specs/032: the same
  matches the form and goals charts count (`teamLeagueMatches` for TASO, the
  season's finished matches for football-data).
- **Signed-in readers only**, through `Analyysit`'s existing gate and prompt.
- **A bar chart** on the specs/030 foundation: hand-rolled server SVG, a text
  alternative, and theme colours.

### Out of scope

- A home/away split of the other charts (form, goals, position).
- Neutral venues. League matches always have a home side.
- League averages or other teams, for comparison.
- Draw % and loss % as their own measures (Q1).

## UX / UI (Finnish strings)

**Where:** `Analyysit`, the fifth panel, after `Maalit yhteensä`.

**Shape** (Q2): one panel with four rows, one per measure. Each row has
two horizontal bars, home above away, each on a faint track the length of its
scale, with its value printed in one column just past the tracks, so the chart
can be read exactly without an axis. (The column rather than each bar's own end
was decided while building it; see the decision record.)

| String | Where | Status |
|---|---|---|
| `Koti- ja vierastilastot` | panel subheading. Miikka's wording, in place of the proposed `Koti ja vieras` | settled (Q4) |
| `Pisteitä / ottelu` | measure row, 0 to 3 | settled (Q4) |
| `Tehdyt maalit / ottelu` | measure row, 0 to 4 | settled (Q4) |
| `Päästetyt maalit / ottelu` | measure row, 0 to 4 | settled (Q4) |
| `Voittoprosentti` | measure row, 0 to 100 | settled (Q4) |
| `Kotona ({n})` | legend, filled bar; `{n}` is `1 ottelu` / `19 ottelua` | settled (Q4) |
| `Vieraissa ({n})` | legend, outlined bar | settled (Q4) |
| `{measure}: kotona {x}, vieraissa {y}.` | one text-alternative row per measure, e.g. `Pisteitä / ottelu: kotona 2,11, vieraissa 1,58.` | settled (Q4) |
| `Kaudella ei ole vielä pelattuja otteluita.` | instead of the chart, before the first match. specs/032's string | settled (Q4) |
| `Koti- ja vierasotteluja ei voitu laskea. Yritä myöhemmin uudelleen.` | when the data cannot be read | settled (Q4) |

**Numbers** (Q5): per-match values with two decimals and a comma
(`2,11`); win percentage as a whole number with a space before the sign
(`63 %`), as Finnish writes it.

**Telling home from away** (Q6): **filled for home, outlined for
away**, both in the foreground colour, with a legend. They differ in fill, not
colour, as the goals charts' lines differ in dash.

## API & Data

**No new endpoint, no provider request, no new database read.** The panel counts
exactly the matches the form and goals charts count, from the same cached reads.

For each side, over the team's finished league matches on that side:

- **Points per match**: (3 × wins + draws) / matches
- **Goals scored per match** and **goals conceded per match**, from the team's
  side of the fixture
- **Win percentage**: wins / matches × 100

**How it is checked.** Home and away add up to the standings table's row: home
matches + away matches = `O`, and likewise wins, draws, losses, `TM`, `PM` and
`P`. Tests check the sums against `calculateStandings`, the real standings
functions, and end to end against the standings page, for a football-data team
and a TASO team.

**Caching:** none. One pass over at most ~40 matches.

### The scales, measured (Q3)

Measured on 2026-09-19 from the same stored top-tier data as specs/032: 118
team-seasons, each counted at home and away, excluding any side with fewer than
five matches (472 goals figures in all).

| per match, over a season | median home | median away | highest |
|---|---|---|---|
| goals scored | 1,42 | 1,29 | 3,12 (Bundesliga, home) |
| goals conceded | 1,27 | 1,47 | 2,77 |
| points | 1,47 | 1,26 | 2,59 |
| win % | 38 | 35 | 82 |

Only 1 of 472 goals figures is above 3, and none is above 4. The fixed
scales: **points 0–3** (the most possible), **goals 0–4** (never clipped in the
sample), **win % 0–100**. The printed value always states the true number, and a
bar never extends past its row.

## Chart foundation: a bar chart

A new `BarChart` beside `LineChart`, in the same way: server SVG, geometry in
exported functions tested directly, theme tokens only.

- Rows of measures, each with its own scale, since the measures do not share
  units.
- Two bars per row: filled and outlined, each on a track the length of its
  row's scale, the values in one column past the tracks.
- A legend, the same shape as `LineLegend`.

## Edge Cases

- **No finished match:** the message, no chart.
- **Matches on one side only** (early season): that side's bars are absent and
  its values read `–`; the legend still shows `Kotona (0 ottelua)` (Q7).
- **Zero wins:** win percentage `0 %`, an empty bar at the axis.
- **Signed-out reader:** the `Analyysit` prompt, and no values in the HTML.
- **Pass-through tables, cup pages, data that cannot be read:** exactly as
  specs/031 and specs/032.

## Performance & Limits

Unchanged: no provider request and no database read added.

## Security & Secrets

No new environment variables. No secrets.

## Acceptance Criteria

Written against the answers under *Decisions*.

- [ ] A signed-in reader on a league team's page sees `Koti- ja vierastilastot` in
      `Analyysit`, after `Maalit yhteensä`: four measures, each with a home bar
      and an away bar and both values printed
- [ ] Each value is computed from the team's finished league matches on that
      side, from its own side of each fixture
- [ ] Home and away add up to the standings page's `O`, `TM`, `PM` and `P` for that
      team, for at least one football-data and one TASO league
- [ ] Home is filled, away outlined; the legend names both with their match counts
- [ ] Fixed scales: points 0–3, goals 0–4, win % 0–100
- [ ] Per-match values with two decimals and a comma; win % a whole number with
      `%`
- [ ] The text alternative lists every measure with both values
- [ ] No match: the message, no chart. One side without a match: its bars absent,
      its values `–`
- [ ] Signed out: no chart and no values in the HTML, still one prompt
- [ ] No provider request and no database read added, asserted by tests
- [ ] The other charts are unchanged
- [ ] No client-side JavaScript; correct in light and dark themes

## Tests Required

- `tests/unit/lib/home-away.test.ts` (new): each measure per side; the away side
  read correctly; sums equal `calculateStandings`' row; one side empty; none.
- `tests/unit/components/charts/bar-chart.test.tsx` (new): bar lengths against
  their scale, fill and outline, printed values, a value past the scale kept in
  its row, the legend.
- Panel, section, service and page tests as specs/031's and specs/032's.
- `tests/e2e/home-away.spec.ts` (new): the sums against the standings page for a
  football-data team and a TASO team; signed out.

## Files To Update

- `specs/033-home-vs-away.md` (this file)
- `src/lib/home-away.ts` (new), the two services, `src/components/charts/bar-chart.tsx`
  (new), a chart, a panel, `analytics-section.tsx`, both team pages
- `decisions/033-home-vs-away.md`, written by the implementing agent

## Decisions

Answered by Miikka on 2026-09-19.

| | Question | Answer |
|---|---|---|
| Q1 | Measures | Points, goals scored and goals conceded per match, and win %; draw % and loss % left out |
| Q2 | Shape | One panel, a row per measure, home and away bars with values printed |
| Q3 | Scales | Fixed per measure, as measured: points 0–3, goals 0–4, win % 0–100 |
| Q4 | Strings | As proposed, except the heading: `Koti- ja vierastilastot` — *"'Koti ja vieras' might need something.. like maybe 'Koti- ja vierastilastot'. others are good"* |
| Q5 | Number format | Two decimals per match (`2,11`), a whole percent (`63 %`) |
| Q6 | Home and away apart | Filled and outlined, one colour, with a legend |
| Q7 | A side with no match yet | Its bars absent and its values `–` |

## Open Questions

None. Every question above is answered.
