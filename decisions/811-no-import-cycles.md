# 811 — No import cycles: decisions

Chore #811. Three import cycles ran through `src/`: `home-baseline.ts` and
`match-service.ts`, `guessing-game-board.ts` and `guessing-game-store.ts`, and
six components around `competition-analytics.tsx`. Each is broken by moving
the piece both sides need into a module both can import, and Biome's
`noImportCycles` keeps new ones out.

| Decision | Why |
|---|---|
| `suspicious/noImportCycles` is `error`, with `ignoreTypes: false` | With the default, `ignoreTypes: true`, Biome 2.6.8 reported only the components' cycle: both `lib` cycles have an `import type` on one side. A type-only cycle cannot leave an import `undefined` at load, but counting types reports exactly the three cycles the issue names and nothing else, so it costs nothing now and keeps the two `lib` cycles from coming back |
| `IN_PROGRESS_NOTE`, `ROUNDING_NOTE` and `inProgressSeasonLine` live in `src/components/analytics-notes.ts` | `match-prediction.tsx` took `ROUNDING_NOTE` (decisions/051) and `season-summary-section.tsx` took `inProgressSeasonLine` (decisions/066) from `competition-analytics.tsx`, which reaches back to them: to `match-prediction.tsx` through `knockout-forecast.tsx` and `season-forecast.tsx` (`QUALITY_LINK`), to `season-summary-section.tsx` through `analytics-section.tsx` (`ANALYTICS_HEADING`, `SIGNED_OUT_MESSAGE`). A module of lines that imports no block can be imported by any block. `IN_PROGRESS_NOTE` moves too because `inProgressSeasonLine` prints it. 051's and 066's one shared sentence stands; only where it is defined changes |
| `FootballDataMatchRow`, `TasoMatchRow` and `StoredMatch` live in `src/lib/match-detail.ts` | `home-baseline.ts` took `StoredMatch` from `match-service.ts`, which calls `homeBaseline`. `match-detail.ts` is the pure reading of a stored row, under the same record as `StoredMatch` (decisions/019); `match-service.ts` already imports it, and it imports neither side. The row types move with `StoredMatch` because it is built from them |
| `UpcomingMatch`, `AwaitingGuess`, `SettledGuess` and `GameView` live in `src/lib/guessing-game.ts` | `guessing-game-board.ts` took `GameView` from `guessing-game-store.ts`, which calls the board's `readModelGuesses`. `guessing-game.ts` already holds the leaderboard's shapes (`BoardEntry`, `BoardRow`, `Board`) and the `Guess` and `Settlement` these four are built from, and imports neither side. Moving `readModelGuesses` into the store instead was not done: it is the board's read of the models (decisions/074) |
| Every importer names the new module; the old ones re-export nothing | One import path to each name. A re-export would leave two, and the old module would look like the home |

Verified on Biome 2.6.8: `npm run lint` passes with the rule on. Importing
`competition-analytics.tsx` back into `analytics-notes.ts` failed it with 11
`noImportCycles` errors, and an `import type` of `match-service.ts` in
`home-baseline.ts` with 2.
