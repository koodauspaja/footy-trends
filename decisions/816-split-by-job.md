# 816 — `taso-standings-service.ts` and `guessing-game-store.ts` split by job: decisions

Chore #816, the third of its pull requests, after the folders
(decisions/816-lib-domain-folders.md, decisions/816-scripts-folders.md).
`taso-standings-service.ts` was 2,504 lines and `guessing-game-store.ts` 1,043.
Each is now split by job. Every declaration's text is unchanged; what changed is
which file holds it, the imports, and an `export` where another file now needs
the declaration.

| File | Lines | What it holds |
|---|---|---|
| `taso/taso-carry-over.ts` | 165 | Which groups continue another's table, and the points they carry over (`CARRY_OVER_CONFIG`) |
| `taso/taso-tables.ts` | 677 | A group's table built from its stored rows: TASO's table kept or ours calculated (`buildGroup`), and a league's path through its groups (`leaguePath`) |
| `taso/taso-sync.ts` | 492 | Syncing matches, group rows and levels, and the synced reads (`getSyncedSeasonMatches`, `getSyncedGroupTeams`) |
| `taso/taso-seasons.ts` | 244 | Which seasons exist: stored, current, the page's range and context, category names |
| `taso/taso-standings-service.ts` | 585 | The standings reads: tables, rounds, match lists, table movement, and `classifySeasonGroups` |
| `taso/taso-team-panels.ts` | 463 | A club's seasons as the team page reads them: position series, panels, comparison, streak records, summary |
| `guessing-game/guessing-game-store.ts` | 693 | The season, the balance, joining, and a guess in one transaction |
| `guessing-game/guessing-game-settle.ts` | 365 | Settling: each match's guesses paid or voided in one transaction, and the run's report |

| Decision | Why |
|---|---|
| The TASO files import in one direction: carry-over, then tables, sync, seasons, standings, team panels, each only from those before it | No cycle, so `noImportCycles` (decisions/811-no-import-cycles.md) holds. The pure table rules sit below everything that reads storage, and the team page sits on top because it reads the standings' classification |
| Six TASO files, not the issue's three | The issue's three jobs (syncing, reading standings, team panels) gave a standings file of over 1,300 lines. The table rules are what both reads and sync share, so they get their own file, and with them out the carry-over configuration and the season discovery are separable too |
| `taso-standings-service.ts` and `guessing-game-store.ts` keep their names, for the reads and for the store | Most importers read standings or use the store; they keep their imports |
| 26 TASO declarations gain `export`; no guessing-game one does | Each is used from another of the new files now. `guessing-game-settle.ts` only needs `storedGuess`, `Client` and `FINISHED`, which were exported already |
| Every import, `vi.mock` and dynamic `import()` names the module that now holds the name, and a mock whose names now live in two modules becomes two mocks | One import path to each name, as decisions/811-no-import-cycles.md. A partial mock keeps `importOriginal` of its own module |
| A mock's meaning is unchanged | A mock replaces a name only for code importing it from another module. Seven names are now called from another of the new files (`getSyncedSeasonMatches`, `getSyncedGroupTeams`, `withContinuedRoundNumbering`, `CURRENT_SEASON_CACHE_TTL_SECONDS`, `parentGroupId`, `CARRY_OVER_CONFIG`, `classifySeasonGroups`), and no test mocks any of them |
| The test files are not split | `taso-standings-service.test.ts` and `guessing-game-store.test.ts` test the behaviour as it was; they import each name from its new module. Splitting them as well would double the diff for no behaviour checked |
| `storedGuess`'s comment, "Only this module writes guesses", stays | Settling updates a guess's settlement columns (`settledAt`, `tier`, the result), not the guess; the guess's own columns are written only by the store |
| Each new file's header cites decisions/009-veikkausliiga.md and decisions/013-more-finnish-competitions.md (TASO), or decisions/072, 076 and 766 (guessing game), then this record | The records of the module the declarations came from, as its header had them |

Verified: each declaration's text was compared before and after by parsing
both sides. Of `taso-standings-service.ts`'s 99, 73 are identical, 24 identical
but for `export`, and 2 (`parentGroupId`, `roundRange`) identical once the
formatter's line wrapping of the longer signature is ignored. All 55 of
`guessing-game-store.ts` are identical. No resulting file is over 800 lines.
