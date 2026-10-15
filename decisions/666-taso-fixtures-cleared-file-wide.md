# 666 — The TASO integration file clears its fixtures around every test: decisions

Bug #666. `tests/integration/taso.test.ts` ran `clearFixtures` only inside its
first describe. The `synchronizeGroupTeams concurrency` describe (#196) sat
outside it, so its three `VL` / `spljp99` / 901102 group rows outlived the
run, and e2e afterwards read 901102 as Veikkausliiga's current season. The
901103 describe (#628) had no cleanup either; its rows went only because the
describe after it (#644) happens to clear season 901103.

| Decision | Why |
|---|---|
| `beforeEach` and `afterEach(clearFixtures)` at the top of the file, not in a describe | A describe added later is covered without anyone remembering to add hooks. `clearFixtures` already deletes every `spljp99` group row, which covers 901102 and 901103 alike. |
| A top-level `afterAll` asserts no row with a season id in the file's own fixture block, 901000 to 901999, is left in `taso_group_teams` or `taso_matches` | Every season this file writes is a 9011xx id, so the block names the file's fixtures without listing them. The block and not "900000 and up": `tests/unit/scripts/integration-fixtures.test.ts` gives each block to one file, and 900xxx is `standings.test.ts`'s, so a wider bound would also blame this file for another's rows. It fails on the code before this fix, so it is the regression test, and it catches a describe that writes outside `clearFixtures`' scope. |
| No suite-wide "leaves the database as it found it" check | Measured on 2026-10-15 at `7afb18d`: row counts of every table in `footy-trends_test`, from a clean start, before and after the whole integration suite. The only change was these three rows, so this file is the whole class today. A check for every file is a mechanism of its own, in a path every integration file shares, and is left to an issue of its own if wanted. |
