# 816 — Folders in `scripts/`: decisions

Chore #816, the second of its pull requests. `scripts/` was one flat folder of
56 TypeScript files and one shell script. It now has a folder per job, and
`tests/unit/scripts` mirrors it. Moves and the paths that name them, nothing
else, under the same rules as decisions/816-lib-domain-folders.md.

| Folder | What it holds |
|---|---|
| `local/` | Making a checkout run: `npm run setup`'s TypeScript half, the local services and Docker, the preflight |
| `db/` | The database: resets, migration naming and generation, the integration suite's database, granting admin |
| `backfill/` | The production backfill |
| `predictions/` | The hourly predictions run |
| `e2e/` | The end-to-end suite's target and freshness check, and recording its TASO fixture |
| `checks/` | The gates: `npm run verify`, the comment rules, coverage gaps, issue boxes, the Sourcery review check, the review-findings count |
| `release/` | The release pull request and its version |
| `environments/` | Standing up a Railway environment, and the Sentry verification |
| `shared/` | What several scripts use: the entry-point check, executable lookup, GitHub reads |

| Decision | Why |
|---|---|
| `scripts/setup`, the shell script, stays where it is | It is the first command on a fresh clone, `./scripts/setup` in `README.md` and `INSTALL.md`, and it finds the repository root as its own folder's parent. Moving it changes that line too, which is not a move |
| Its test, `setup-shell.test.ts`, stays in `tests/unit/scripts` | The mirror follows the subject |
| `setup-*.ts` go in `local/`, not `setup/` | A folder cannot share the shell script's name |
| `coverage-exclusions` and `integration-fixtures` go to `checks/`, `predictions-unreachable` to `predictions/` | The three tests named after no single script go with what they check. `recorded-issue-citations.json` moves with `comment-rules.test.ts`, which reads it |
| A path written as `path.join(..., "scripts", "backfill.ts")` or with Windows separators is rewritten by hand | The rewrite matched `scripts/<name>`; three tests build their path from segments, and one spells a Windows path. Each failed until it was fixed |

Verified: `npm run typecheck`, `npm run lint`, `npm run test:unit`,
`npm run test:shuffle` and `npm run test:integration` pass, with the same 301
test files and 6,852 tests as before the move, and 100 % on all four coverage
metrics. No path outside `decisions/` and `specs/` names a script at its old
location.
