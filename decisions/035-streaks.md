# 035 — Streaks: decisions

Implementation notes for `specs/035-streaks.md` (#332). The spec says what the
panel shows; this says how, and where the implementation had to decide something
the spec did not.

## The property everything serves

**The figures are the same matches the charts plot, read a different way.** The
match numbers in `Ottelut 12–14` are the numbers the form and goals charts use,
because both come from `teamMatchesInOrder`. End to end, the current streak is
checked against the standings table's own `Vire` column: its last five results,
oldest first, must end on the run the panel calls current.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| One pass, four predicates | `KINDS` maps each kind to the outcomes it is made of, and one `longestRun` walks the season per kind | A run of wins and a run without defeat differ only in which outcomes continue them. Four copies of the same loop would be four places for an off-by-one. |
| Ties | The first of equally long runs | Q5. A "most recent" rule would move the answer as the season goes on, so the same season would read differently in May and in October. |
| The current streak's type | Its last match's outcome | Q2's "whichever it is": a reader on a run of draws is on a run of draws, not on "no run". |
| A draw | Breaks wins and defeats, continues unbeaten and winless | Both directions matter: it is what makes unbeaten longer than wins, and winless longer than defeats. |
| Finnish singulars | `count()` takes both forms: `1 voitto` / `3 voittoa`, `1 ottelu ilman tappiota` / `4 ottelua ilman tappiota` | A count of one is not a plural in Finnish, and a panel of five figures shows a 1 often. |
| One match's span | `Ottelu 8`, not `Ottelut 8–8` | The spec gives `Ottelut {a}–{b}`; a one-match run reads wrong that way. Decided here and tested. |
| Not a chart | A `<dl>` of label and value, two columns from `sm:` up | Q3. The `<dl>` is what the content is: five names and their values. |
| Where the panel's data comes from | A `streaksOf` over the services' league matches, one thin service per provider | The same shape as the other panels, so the TASO league rule, the pass-through tables and the playoff exclusion stay decided in one place (`teamLeagueMatches`). |

## What the tests prove, and how

- **The arithmetic**, over hand-written seasons like `WWDLLDW`, where every
  figure can be counted by eye; and the away side is read correctly, because the
  fixture alternates home and away.
- **Agreement with the standings page**: end to end, the current streak matches
  the `Vire` column's trailing run, and no run exceeds the team's matches played.
- **The request budget**: one read for football-data and the position chart's two
  for TASO, with no provider request.
- **Ten mutations**, all caught: a draw breaking unbeaten or winless, reporting
  the last of equal runs, reading the current streak from the first match,
  never breaking a run, match numbers off by one, always using the plural,
  pluralising a one-match span, leaving the panel out of the section, and
  reporting an empty season as an error.

## Left open, deliberately

- **A record book across seasons** — the club's longest run ever — belongs to
  #426, the across-seasons placeholder.
- **Streaks of clean sheets or of scoring** are a different measure; `Nollapelit`
  (#334) covers clean sheets as a share.
