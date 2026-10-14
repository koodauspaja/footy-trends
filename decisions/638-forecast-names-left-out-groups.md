# 638 — `Kauden ennuste` names the groups it leaves out: decisions

Notes for #638, a chore. It adds S23 to specs/061-season-simulation.md.

## Why

A group shown from TASO's own numbers is not simulated (specs/061 S15), and
the panel said so only when no table of the season was. On 2026-10-13
Veikkausliiga's panel showed `Karsintasarja` alone. Miikka, checking the
feature that day: "seems like veikkausliiga is missing mestaruussarja".
Nothing on the page said the title race was absent, or why.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| The line | `Mestaruussarja ei ole mukana, koska sen sarjataulukko näytetään Palloliiton tiedoista sellaisenaan.`; for two or more, `A ja B eivät ole mukana, koska niiden sarjataulukot näytetään…`, three as `A, B ja C` | Miikka, 2026-10-13: "As proposed". The reason is S15's own line's, so the two read as one explanation |
| Which groups it names | Pass-through groups only | Miikka, 2026-10-13: "No, pass-through only". A match list has no table, so the reason would be false of it. A group that has been continued is not named either: its teams are in the groups that continue it |
| A pass-through group with no fixture left | Named | Its teams are absent from the panel either way, which is what the line explains |
| Where the names come from | `seasonForecast` returns `leftOut` beside `tables`: the names of the inputs with `simulated: false`, in the page's order | The service already drops match lists and continued groups before that function, so what reaches it unsimulated is exactly the pass-through groups. No second classification |
| Where the line sits | Directly under the tables, above how the figures were made | It is about which tables are there, and is read with them |
| Joining the names | In `leftOutText`, beside the string | The head-to-head page's `listText` is private to that page and takes two or more; a shared helper for two one-line callers is not this chore's |
| The cache key | `forecast:v2:…`. This overrides the key in decisions/061-season-simulation.md, which stays as written | A forecast cached by the release before has no `leftOut`, and the panel reads its length, which throws on a value without one. Such a value lives for up to fifteen minutes after a deploy |
| No end-to-end test | Unit and component tests only | A season has a pass-through group only while TASO's table disagrees with its results, which no test can arrange against the live provider |

## What the tests prove, and how

- **Every mutation below was caught**, one row each:

  | # | Mutation |
  |---|---|
  | 1 | Every table named as left out, simulated or not |
  | 2 | No table named as left out |
  | 3 | A table without a name named |
  | 4 | The line never shown |
  | 5 | The line shown with nothing left out |
  | 6 | One group given the plural line |
  | 7 | Two groups given the singular line |
  | 8 | Names joined with commas only |
  | 9 | The line under how the figures were made |
  | 10 | A match list passed on as a table |
  | 11 | A continued group passed on |
  | 12 | The cache key left at `v1` |
- **By eye**, 2026-10-13, signed in on the production build the end-to-end run
  made, at 375 px: Veikkausliiga's panel shows `Karsintasarja` and under it
  the line naming `Mestaruussarja`, which the page was showing from TASO's
  numbers at that moment; the Premier League's panel, with its one table
  simulated, has no such line.
- **Not looked at on a page**: a season with no simulated table. No league
  was in that state, and S15's line for it is held by the tests that were
  there before, unchanged.
