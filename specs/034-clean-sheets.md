# 034 — Clean sheets over a season

> **Status: agreed on 2026-09-20 and implemented (#427).**

## Summary

A chart in the team page's `Analyysit` section showing how often the team keeps
a clean sheet, after each match of a season: the running share of its matches
with nothing conceded. Where `Maalit otteluittain` shows how many goals go in,
this shows how often none do — the difference between a defence that leaks one
every week and one that alternates shut-outs with heavy defeats.

## Scope

### In scope

- One team, one competition, one season, in `Analyysit` after
  `Koti- ja vierastilastot`, following the page's season selector.
- Both providers, football-data.org and TASO. Results only.
- **League format only**, exactly as specs/031 Q2 and specs/032: the same
  matches the form, goals and home/away panels count.
- **Signed-in readers only**, through `Analyysit`'s existing gate and prompt.
- Drawn with `LineChart` (specs/030, specs/032). No new chart code.

### Out of scope

- Clean sheets across seasons — within the season here, over time later (Q1); #330 owns that axis.
- Home and away apart. `Koti- ja vierastilastot` is where a home/away split
  lives; a clean-sheet row could be added there later, as its own issue.
- Goals conceded per match. That is `Maalit otteluittain`.
- "Failed to score", the mirror measure (Q2).

## UX / UI (Finnish strings)

**Where:** `Analyysit`, the sixth panel, after `Koti- ja vierastilastot`.

| String | Where | Status |
|---|---|---|
| `Nollapelit` | panel subheading | settled (Q3) |
| `Ottelu` | x-axis label, as the other per-match charts | settled (Q3) |
| `Nollapelien osuus` | y-axis label, 0 to 100 | settled (Q3) |
| `Nollapelien osuus {n}. ottelun jälkeen: {x} % ({y}/{n}).` | one text-alternative row per match, e.g. `Nollapelien osuus 12. ottelun jälkeen: 25 % (3/12).` | settled (Q3) |
| `Kaudella ei ole vielä pelattuja otteluita.` | instead of the chart, before the first match. specs/032's string | settled (Q3) |
| `Nollapelejä ei voitu laskea. Yritä myöhemmin uudelleen.` | when the data cannot be read | settled (Q3) |

**Axes.** X: the team's matches in kickoff order, from the first, the same
numbering as the other per-match charts. Y: **fixed 0 to 100 %**, the whole
range a share can take, so seasons are comparable.

## API & Data

**No new endpoint, no provider request, no new database read.** The panel counts
exactly the matches the form, goals and home/away panels count, from the same
cached reads.

**What is plotted** (Q1, Q2): after the team's `n`-th match, the share
of those `n` matches in which it conceded nothing — a **running** share, not a
window. It starts at the first match and ends at the season's own clean-sheet
rate.

**How it is checked.** The last point equals the clean sheets counted over the
team's league matches, which is `matches − matches with goals against`; the
tests check it against the same matches `calculateStandings` counts for `PM`,
and end to end the count in the text row (`{y}/{n}`) equals the standings page's
`O` for `n`.

**Caching:** none, as specs/031 and specs/032.

### Why a running share rather than a five-match window (Q2, settled)

Measured on 2026-09-20 from the stored top-tier data (118 team-seasons, as
specs/032 and specs/033 used):

| | |
|---|---|
| clean-sheet share over a season | median 26 %, 90th percentile 39 %, highest 50 % |
| a five-match window | takes only six values — 0, 20, 40, 60, 80, 100 — and **25 % of all windows are 0** |

A five-match window of a rare event is a step function that sits on the axis a
quarter of the time, which reads as "no data" rather than "no clean sheets". The
running share moves smoothly and ends somewhere checkable.

## Edge Cases

- **No finished match:** the message, no chart.
- **A team that has never kept a clean sheet:** the line sits at 0 % for the
  whole season, which is the true answer; the text rows say `0 % (0/n)`.
- **Signed-out reader:** the `Analyysit` prompt, no values in the HTML.
- **Pass-through tables, cup and national-team pages, data that cannot be
  read:** exactly as specs/031 and specs/032.

## Performance & Limits

Unchanged: no provider request and no database read added.

## Security & Secrets

No new environment variables. No secrets.

## Acceptance Criteria

Written against the answers under *Decisions*.

- [ ] A signed-in reader on a league team's page sees `Nollapelit` in
      `Analyysit`, after `Koti- ja vierastilastot`: one point per finished
      league match, in kickoff order, from the first
- [ ] Each point is the share of the team's matches so far with nothing
      conceded, from its own side of each fixture
- [ ] The last point equals the team's clean sheets over the season, counted
      over the same matches the standings page's `PM` counts, for at least one
      football-data and one TASO league
- [ ] The y-axis is fixed 0 to 100 %
- [ ] The text alternative gives every point as a percentage and a count
- [ ] No match: the message, no chart
- [ ] Signed out: no chart and no values in the HTML, still one prompt
- [ ] No provider request and no database read added, asserted by tests
- [ ] The other panels are unchanged
- [ ] No client-side JavaScript; correct in light and dark themes

## Tests Required

- `tests/unit/lib/clean-sheets.test.ts` (new): the running share; the away side
  read correctly; kickoff order; a season with no clean sheet; none played.
- Chart, panel, section, service and page tests as specs/032's.
- `tests/e2e/clean-sheets.spec.ts` (new): the last point against the standings
  page for a football-data team and a TASO team; signed out.

## Files To Update

- `specs/034-clean-sheets.md` (this file)
- `src/lib/clean-sheets.ts` (new), the two services, a chart, a panel,
  `analytics-section.tsx`, both team pages
- `decisions/034-clean-sheets.md`, written by the implementing agent

## Decisions

Answered by Miikka on 2026-09-20.

| | Question | Answer |
|---|---|---|
| Q1 | One season, or across seasons | Within the selected season — *"within the season in this feature, over time later"*. #330 owns the across-seasons axis |
| Q2 | Running share, or a window | The running share |
| Q3 | Strings | As proposed, `Nollapelit` included |
| Q4 | Where in `Analyysit` | Last, after `Koti- ja vierastilastot`. Grouping the panels is its own chore, deliberately not decided here |

## Open Questions

None. Every question above is answered.
