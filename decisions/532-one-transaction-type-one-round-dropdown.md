# 532 — One transaction type and one round dropdown: decisions

Chore #532, 2026-10-09. Three things were written out more than once: the type
of drizzle's transaction handle, the placeholder team id, and the `Kierros`
dropdown of the standings pages. Each now has one definition.

## The transaction type

`Transaction` is exported from `@/db`, beside `Executor`, which is built from
it. `src/lib/favourites.ts` and `src/lib/admin-users.ts` import it and no longer
declare their own.

## The placeholder team id

`PLACEHOLDER_TEAM_ID` in `src/lib/match-detail.ts` is the one definition: it was
already exported and already imported by three modules. `src/lib/elo.ts` and
`src/lib/team-search.ts` import it and drop their own constants. `match-detail`
is pure, so `elo.ts` stays free of the database.

## The round dropdown

`RoundSelect` takes an optional `wholeSeason`, which adds the `Koko kausi`
option; choosing it calls `onChange` with `undefined`. `StandingsControls` and
`TasoStandingsControls` render it and no longer carry a dropdown of their own.

`useSeasonRoundNavigation` takes the competition as an argument of the function
it returns, not of the hook. `StandingsControls` lets the reader change the
competition, so the code cannot be fixed when the hook is created; with it as an
argument the hook's logic replaces the copy `StandingsControls` had.

### The one behaviour change

The standings pages' dropdown takes its value from props on every render. The
inline copies set it once, on first render, so after the browser's Back button
the table showed the round in the URL while the dropdown kept showing the round
last picked. Miikka chose the props-driven value on 2026-10-09; it is what
`RoundSelect` already did on the match list
(`decisions/005-listing-matches-for-selected-season.md`).

Without scripting nothing changes: the server renders the selected option
either way.

## Left as it is

- **The `Kausi` and `Kilpailu` selects** still set their value once. After Back
  they can show the previous choice, as before. The issue puts any behaviour
  beyond the round dropdown out of scope.
- **`CupStandingsControls`** keeps its own `navigate`, which always clears
  `kierros`. The issue names the two controls with a round dropdown.
