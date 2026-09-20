# 035 — Streaks

> **Status: every question answered on 2026-09-20; awaiting go.** Nothing is
> implemented until a human says **go**.

## Summary

A panel in the team page's `Analyysit` section giving the team's streaks in the
season: what it is on now, and its longest runs of wins, of matches unbeaten, of
defeats, and of matches without a win. The charts show shape over a season; this answers the question a
reader asks out loud — "how long since they lost?" — as a number.

## Scope

### In scope

- One team, one competition, one season, in `Analyysit`, following the page's
  season selector.
- Both providers, football-data.org and TASO. Results only.
- **League format only**, as the other panels (#425 is where that rule is
  revisited for national teams and cups).
- **Signed-in readers only**, through `Analyysit`'s existing gate and prompt.
- **Not a chart** (Q3): five figures, each longest one with the matches it spans.

### Out of scope

- Streaks across seasons (Q1). #330 is a trajectory, not every panel by season;
  an across-seasons version of the panels has no issue of its own yet.
- Streaks of clean sheets, of scoring, or of anything but results. `Nollapelit`
  (#334) covers clean sheets.
- Home and away streaks apart.
- A record book: the club's longest streak ever, across every season stored.

## UX / UI (Finnish strings)

**Where:** `Analyysit`, after `Nollapelit` (Q6).

| String | Where | Status |
|---|---|---|
| `Putket` | panel subheading | settled (Q4) |
| `Tämänhetkinen putki` | the run the team is on now | settled (Q4) |
| `Pisin voittoputki` | longest run of wins | settled (Q4) |
| `Pisin tappioton putki` | longest run without a defeat (wins and draws) | settled (Q4) |
| `Pisin tappioputki` | longest run of defeats | settled (Q4) |
| `Pisin voitoton putki` | longest run without a win (defeats and draws), the mirror of unbeaten. Added with Q2's fifth figure | settled (Q2) |
| `3 voittoa`, `2 tappiota`, `4 ottelua ilman tappiota`, `5 ottelua ilman voittoa`, `1 tasapeli` | a streak's value, in words that say what it is of | settled (Q4) |
| `Ottelut {a}–{b}` | which matches a longest streak spans, e.g. `Ottelut 5–9` | settled (Q4) |
| `Ei vielä putkea.` | for a figure with nothing to report — a team with no match yet | settled (Q4) |
| `Putkia ei voitu laskea. Yritä myöhemmin uudelleen.` | when the data cannot be read | settled (Q4) |

## API & Data

**No new endpoint, no provider request, no new database read.** Exactly the
matches the other result panels count, in their order (`teamMatchesInOrder`).

**The five figures** (Q2), over the team's finished league matches in
kickoff order:

- **Current**: the run the team is on now, counted back from its last match —
  wins, draws or defeats, whichever it is. A season's last match decides its
  type.
- **Longest wins**, **longest unbeaten** (wins and draws), **longest defeats**,
  **longest winless** (defeats and draws). Each with the matches it spans; the
  **first** such run is reported when two are equally long (Q5).

**How it is checked.** The five figures are derived from the same results the
standings table counts, so a season with no defeat has an unbeaten streak equal
to its matches played, and the streak lengths never exceed `O`. The tests check
them against `calculateStandings`' own row and against hand-built sequences.

**Caching:** none, as the other panels.

## Edge Cases

- **No finished match:** `Ei vielä putkea.` for every figure, no table.
- **A season with no win** (or no defeat): that figure reads `Ei vielä putkea.`,
  the others still show.
- **Every match won:** current and longest wins are both the season, and
  unbeaten equals it too — the same run counted two ways, which is correct.
- **A draw** breaks a winning streak and continues both an unbeaten one and a
  winless one.
- **Signed-out reader:** the `Analyysit` prompt, no values in the HTML.
- **Pass-through tables, cup and national-team pages, data that cannot be
  read:** exactly as the other panels.

## Performance & Limits

Unchanged: no provider request and no database read added; one pass over the
team's matches.

## Security & Secrets

No new environment variables. No secrets.

## Acceptance Criteria

Written against the answers under *Decisions*.

- [ ] A signed-in reader on a league team's page sees `Putket` in `Analyysit`
      with five figures: current, longest wins, longest unbeaten, longest
      defeats, longest winless
- [ ] Each figure says what it counts (`3 voittoa`, `4 ottelua ilman tappiota`),
      and each longest streak says which matches it spans
- [ ] The current streak is the run the team is on now, counted back from its
      last match, whatever its type
- [ ] A draw breaks a winning streak and continues both an unbeaten and a
      winless one
- [ ] No streak of a kind: that figure says `Ei vielä putkea.`; no match at all:
      every figure does
- [ ] No streak length exceeds the team's matches played on the standings page,
      for at least one football-data and one TASO league
- [ ] Signed out: no values in the HTML, still one prompt
- [ ] No provider request and no database read added, asserted by tests
- [ ] The other panels are unchanged
- [ ] No client-side JavaScript; correct in light and dark themes

## Tests Required

- `tests/unit/lib/streaks.test.ts` (new): each figure over hand-built sequences
  — all wins, all defeats, draws between, a season with no win; ties broken as
  Q5 says; the away side read correctly; kickoff order.
- Panel, section, service and page tests as the other panels'.
- `tests/e2e/streaks.spec.ts` (new): the figures against the standings page for a
  football-data team and a TASO team; signed out.

## Files To Update

- `specs/035-streaks.md` (this file)
- `src/lib/streaks.ts` (new), the two services, a panel,
  `analytics-section.tsx`, both team pages
- `decisions/035-streaks.md`, written by the implementing agent

## Decisions

Answered by Miikka on 2026-09-20.

| | Question | Answer |
|---|---|---|
| Q1 | This season, or historical too | This season — *"let's stay within a season in this"*. Noted in the same breath: whether an across-seasons feature exists *"in place"* for all of these. It does not; #330 is one trajectory, and a broader one has no issue yet |
| Q2 | Which figures | Five: current, longest wins, longest unbeaten, longest defeats, longest winless |
| Q3 | Not a chart | Figures with labels |
| Q4 | Strings | As proposed, *"fine for now"*; `Pisin voitoton putki` added with the fifth figure |
| Q5 | Ties between equal streaks | The first |
| Q6 | Where in `Analyysit` | After `Nollapelit` |

## Open Questions

None. Every question above is answered.
