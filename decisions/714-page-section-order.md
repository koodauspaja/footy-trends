# 714 — Each kind of page puts its sections in an agreed order: decisions

Chore #714. The order of a page's sections had grown one feature at a time, and
spec 071 (#697) opens only a page's most basic part by default, so that part has
to come first. The order was agreed with Miikka in chat on 2026-10-23 and
written on the issue. A new section is placed by it, not appended.

## The order

| Page | Order |
|---|---|
| Domestic league standings | The tables, the later phases first in TASO's order (`Mestaruussarja`, then `Karsintasarja` / `Haastajasarja`) and the first phase (`Runkosarja`) last. Then `Pudotuspelit`, then the knockout match lists in TASO's order, the legend, `Analyysit` |
| Suomen Cup | `Pudotuspelit` (the drawn tree), the rounds latest first, `Cupin ennuste`, the legend |
| Liigacup, World Cup, EC | Group tables, then `Pudotuspelit`: unchanged |
| Foreign league, Champions League | The table (`Liigavaihe`), then `Pudotuspelit`, then `Analyysit` with `Kilpailut rinnakkain` last: unchanged |
| Team pages | `Ottelut`, with the matches still to play first, nearest first, then the played ones newest first. Then `Analyysit`, its groups unchanged |
| Huuhkajat, Helmarit | The years, newest first, each in the team pages' match order. Then `Analyysit`, which used to sit above them |
| Front, region pages, `/ennusteet`, match pages, head-to-head, `/ottelut`, favourites, settings, admin | Unchanged |

The first section on each page is its most basic part, which #697 opens by
default.

## Decisions

| Decision | Why |
|---|---|
| A league's phases come from the match dates: the first phase is every group, in TASO's order, before the first group that starts after all of them have ended. It moves last, and the rest keep TASO's order (`leagueGroupOrder`, `src/lib/group-order.ts`) | TASO's names differ between competitions (`Mestaruussarja`, `Ylempi jatkosarja`, `Lohko A`), so a rule matching names would miss some. Its group ids already run phase by phase, and within a phase put the top group first, so its order is kept everywhere but for the first phase. On the test database on 2026-10-23 this gives `Mestaruussarja, Karsintasarja, Runkosarja` for VL 2025, `Ylempi jatkosarja A–C, Alempi jatkosarja A–C, Lohko A–C` for M2 2026, and leaves a season with one phase as it was. A group with no dated match, which a group built from the season's matches never is, stays with the groups it sits among |
| The order is applied in `getSeasonStandings`, which holds the matches. The page splits the tables from the match lists to put the tree between them | The page never sees the matches. `getSeasonStandings` has one caller, this page |
| A league's knockout: the tables, then the `Pudotuspelit` tree, then the knockout match lists | "Standings first", and the tree sits next to the tables as on the Champions League. The lists give the detail the tree summarises |
| A cup's rounds latest first: its match lists reversed, then any group tables in TASO's order (`cupGroupOrder`) | "The rounds with the latest round first". A group-stage cup such as MSC 2021 shows its knockout first and its groups after it |
| A team's matches: unplayed nearest first, then played newest first (`upcomingFirst`, `src/lib/match-order.ts`). A match is played when both sides have a goal count | A postponed match keeps its old kickoff and has no score, so it stays with the ones to play. Applied where the team page and Huuhkajat' years hand their matches to `MatchListTable`, so `/ottelut`, the cup rounds, head-to-head and `Aiemmat kohtaamiset` keep their own order |
| Written down here and in `skills/ui-review.md`, class 9 | Where a new section's author looks |
