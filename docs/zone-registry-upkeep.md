# Upkeep: the foreign leagues' zone registry

`src/lib/zone-registry.ts` holds, per league and season, the places the table
marks: European places, promotion, play-offs and relegation. football-data
publishes none, so a person keeps them. A season with no entry shows no zones
and nothing fails, so nobody is told when one is missing.

## Each summer, before the first round of the new season

1. For each of `PL`, `ELC`, `FL1`, `BL1`, `SA`, `DED`, `PPL`, `PD` (August) and
   `BSA` (the calendar year, so January), open the English Wikipedia page of
   the league's season, e.g. `2026–27 Premier League`, and read the table's
   legend and the places it marks by position.
2. Add the season to the league's `seasons` in the registry, by the one rule of
   `specs/065-foreign-league-zones.md` (S7): the places the page marks by
   position, left out where it tags a place to a cup winner, a title holder or
   an administrative decision. No check against UEFA's or CONMEBOL's lists.
3. If a league's number of teams changed, change its `teams`.
4. Run `npm run test:unit`: a stretch past the league's table size fails it.
5. When a finished season's marks changed afterwards (a cup winner's place
   passed down), the registry keeps the places as the page marked them when it
   was written; edit the season only to correct an error.
