# 031 — Rolling form trend

> **Status: agreed on 2026-09-19 and implemented (#415).**

## Summary

A line chart on the team page showing the team's **form**, meaning its points per
match over its last five matches, after every match of a season. A reader sees
when a team came into form or lost it, which the final table and the position
chart (specs/030) hide: a team can hold 2nd place while winning one match in
five. It is the second chart on the chart foundation from specs/030.

## Scope

### In scope

- One team, one competition, one season, on the team page
  (`/ulkomaat/joukkue/{id}`, `/kotimaa/joukkue/{id}`), following the page's
  season selector like the position chart.
- Both providers, football-data.org and TASO. Results only (final scores), so
  no new data.
- **League competitions only**, as in specs/030 Q2 (Q2: *"let's for now focus on the Vire in league format only"*).
- **Signed-in readers only**, as all analytics are. The gate is the one
  specs/030 built (`canSeeAnalytics`).
- The chart is drawn with `LineChart` from specs/030. No new chart code beyond
  what this chart needs.

### Out of scope

- A window other than five, or a selector between windows (Q1).
- Comparing teams, or a league average line.
- Form across seasons (#330) or across competitions.
- Goals-based form. #328 covers goals.
- Playoff and cup matches (bracket rounds, `match-list` groups) (Q2).

## UX / UI (Finnish strings)

**Where:** the team page, in one **`Analyysit`** section (A) that holds every
chart for the competition and season the page has selected: the position chart
(`Sijoitus kierroksittain`) first, then this one. Each chart's own heading
becomes a subheading under `Analyysit`. A signed-out reader sees `Analyysit` and
the one sign-in prompt beneath it, and no chart headings. When no chart applies
(a cup, knockout or national-team page), the section is not shown at all.

| String | Where | Status |
|---|---|---|
| `Analyysit` | heading of the team page's analytics section, over every chart and over the one sign-in prompt | settled (A) |
| `Vire otteluittain` | chart subheading under `Analyysit`. Reuses the standings table's column name `Vire`, which readers already know | settled (Q3) |
| `Ottelu` | x-axis label: the team's 1st, 2nd … match, in the order played | settled (Q3) |
| `Pisteitä / ottelu` | y-axis label, 0 to 3 | settled (Q3) |
| `Vire {n}. ottelun jälkeen: {ppg} pistettä ottelua kohden.` | one row of the text alternative, per match; `{ppg}` with a decimal comma, e.g. `2,2` | settled (Q3) |
| `Vire näytetään, kun joukkue on pelannut vähintään viisi ottelua.` | instead of the chart, when the team has played fewer than five matches | settled (Q4) |
| `Virettä ei voitu laskea. Yritä myöhemmin uudelleen.` | when the data cannot be read; mirrors specs/030's error string. Miikka's correction of `Vireä` | settled (Q3) |
| `Kirjaudu sisään nähdäksesi analyysit ja trendit.` | signed-out reader; specs/030's string, written for all analytics | settled (specs/030 A); shown **once**, under `Analyysit` (Q5, A) |

**Axes.** The y-axis runs from 0 at the bottom to 3 at the top: more points is
higher, the opposite of a position. The x-axis runs from the team's first plotted
match to its last. A season in progress ends at the last match played, with
nothing drawn for matches still to come.

**Text alternative.** Every point is also a text row, as in specs/030, for
screen readers.

## API & Data

**No new endpoint, no provider request, no new database read.**

**What "form" is: the same as the standings table's `Vire` column.** Verified in
`calculateStandings` (`src/lib/standings.ts`): `Vire` is a team's last five
finished matches **in kickoff order**, not round order, among the matches its
table counts. This chart plots that value after every match:

- For each of the team's finished league matches, in kickoff order, take that
  match and the four before it. Form is `(3 × wins + draws) / 5`. So it is always
  a multiple of 0.2 and prints exactly with one decimal.
- **The last point equals the `Vire` column** on the standings page, converted
  to points. That is the checkable property this feature rests on, as the
  standings page's `?kierros=N` was for specs/030.
- **Kickoff order, not round order.** This matches `Vire`, and it keeps TASO's
  out-of-order round numbers (#413) out of the picture. The x-axis is the team's
  match count, which the reader can check against the table's `O` column.

**Which matches count** (Q2): the team's finished matches in the
selected competition and season that belong to a **table**. For football-data
that means the league's matches. For TASO it means every group that renders as a
table, own-calculated or pass-through, in both the regular season and its
continuation. `match-list` groups (playoffs, cup rounds) are excluded. Across a
split, the line continues in kickoff order. That is also what `Vire` shows in a
carry-over table, because the carry-over table counts the regular-season matches
as well.

**Where the data comes from:**

- **football-data:** the season read that `getTeamMatches` and the position chart
  already share (`cache()`d `getSyncedSeasonMatches`, specs/030).
- **TASO:** `classifySeasonGroups`, already `cache()`d and already called by the
  position chart on the same page, which knows which groups are tables. So the
  form chart adds **no read and no TASO request** beyond what specs/030 made.

**Caching:** none. Form over a season is one pass over at most ~40 matches, far
cheaper than the position chart's per-round tables, which were measured at
1.26 ms.

**Points deductions and carry-over points do not apply.** Form comes from
results only, as `Vire` does.

## Edge Cases

- **Fewer than five matches played:** the message in the UX table, no chart
  (Q4). The standings table's `Vire` column still shows a single result after
  one match; the chart differs on purpose, because a one-match average reads as
  a collapse or a peak.
- **Signed-out reader:** the prompt, and no form values in the HTML, as in
  specs/030.
- **A match with no round (`matchday === null`)** still counts, because form
  follows kickoff order and `Vire` counts it too. This differs from the position
  chart on purpose.
- **Scheduled, postponed or abandoned matches** do not count. Only finished
  matches with a score do.
- **Two matches of the team with the same kickoff time:** cannot happen for one
  team. If the data ever has it, order by provider match id so the order is
  stable.
- **A TASO season whose tables are pass-through** (unverified): form is still
  drawn (Q2). It uses results only, which TASO publishes, so nothing
  is being invented. That is unlike positions, which specs/030 rule C refused to
  compute there.
- **Cup, knockout, national-team page:** no section, as in specs/030.
- **Data cannot be read:** the error string; the rest of the page renders.

## Performance & Limits

| per team page view | today (after specs/030) | with this chart |
|---|---|---|
| provider requests | as specs/030 | **unchanged** |
| database reads | as specs/030 | **unchanged**: both reads are `cache()`d and already made |
| extra work | position tables | + one pass over the team's matches |

## Security & Secrets

No new environment variables. No secrets. The analytics gate and its e2e
override are specs/030's, unchanged.

## Acceptance Criteria

Written against the answers under *Decisions*.

- [ ] A signed-in reader on a league team's page sees `Vire otteluittain` for the
      selected competition and season: one point per finished league match from
      the fifth on, in kickoff order
- [ ] Each point equals `(3 × wins + draws) / 5` over that match and the four
      before it; the last point equals the standings page's `Vire` column for
      that team, converted to points, for at least one football-data and one
      TASO league
- [ ] 3 is drawn at the top and 0 at the bottom
- [ ] The text alternative lists every point with a decimal comma
- [ ] A team with fewer than five finished league matches sees the message and
      no chart
- [ ] A signed-out reader sees the sign-in prompt **once** on the team page,
      not once per chart, and the HTML contains no form or position values
- [ ] A cup, knockout or national-team page shows no form section
- [ ] Veikkausliiga 2026, KuPS: the line has one point per match from the fifth,
      ending at its matches played (the table's `O`), across the split
- [ ] Matches in a `match-list` group (playoff, cup round) are not counted
- [ ] No provider request and no database read is added, asserted by tests that
      count them
- [ ] No client-side JavaScript; correct in light and dark themes

## Tests Required

- `tests/unit/lib/form-series.test.ts` (new): window arithmetic; kickoff order,
  not round order; null-round matches count; unfinished matches do not; fewer
  than five gives the message state; last point equals `calculateStandings`'
  `form` converted to points.
- `tests/unit/lib/standings-service.test.ts`,
  `tests/unit/lib/taso-standings-service.test.ts`: the service functions,
  `match-list` groups excluded, a split season in kickoff order, and read counts
  unchanged.
- `tests/unit/components/form-section.test.tsx` (new): each state, the gate
  first.
- Page tests for both team pages: section shown for leagues only.
- `tests/e2e/form-trend.spec.ts` (new): the last point equals the standings
  page's `Vire` for a football-data team and a TASO team; the signed-out prompt;
  no chart for a cup.

## Files To Update

- `specs/031-rolling-form-trend.md` (this file)
- `src/lib/form-series.ts` (new), the two standings services, a section
  component, both team pages
- `specs/030-league-position-by-matchday.md`: the position chart now sits under
  `Analyysit`, and its signed-out prompt is the section's one prompt (A)
- `tests/e2e/league-position.spec.ts`: its signed-out test expects the prompt
  under `Analyysit`, not under the position chart's heading
- `decisions/031-rolling-form-trend.md`, written by the implementing agent

## Decisions

Answered by Miikka on 2026-09-19.

| | Question | Answer |
|---|---|---|
| Q1 | Window | Five only — *"i think five is good"*. It is exactly the `Vire` column |
| Q2 | Which matches | League format only: every table group of a league, pass-through included; `match-list` groups (playoffs, cup rounds) excluded |
| Q3 | Strings | As proposed, with `Vireä` corrected to `Virettä` |
| Q4 | The first four matches | No chart until the fifth, with the message |
| Q5 | Sign-in prompt | One prompt for all of the team page's charts |

| A | Where the one prompt sits | One heading over the team page's analytics, and the prompt stands under it — *"one heading, analyysit or analytiikka. prompt stands there"*. `Analyysit` chosen because it is the prompt's own word (`nähdäksesi analyysit ja trendit`) |

## Open Questions

None. Every question above is answered.
