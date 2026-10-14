# 385 — The unit suite fails when a source file has no test at all: decisions

Chore #385 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/coverage-gaps-plan.ts` at `5b180e0` by #531.

- **`coverage-gaps-plan.ts`.** The split `grant-admin-plan.ts` established.
- **`findCoverageGaps`.** A file no test touches is absent from vitest's
  report, so the gate stays green while Sonar, which indexes the source
  tree, scores it 0%. It caught the repository out three times:
  `admin-user-table.tsx` and `app/admin/page.tsx` in #370,
  `generate-migration.ts` in #376, and `refresh-actions.ts` in #381.
- **`parseSonarProperty`.** General and not one function per key, because
  the guard needs `sonar.sources`, `sonar.exclusions` and
  `sonar.coverage.exclusions`, and its whole purpose is to fail for the
  reasons Sonar fails; any list it kept separately would be free to drift
  from the one Sonar reads. Sliced and not split on `=`: the line begins
  with the key, so this is total, where `split("=")[1] ?? ""` needed a
  fallback that could never run, which lcov reported as an uncovered
  condition.
- **`findUncoveredBranches`.** vitest's v8 provider and lcov's `BRDA`
  records model branches differently, so the text summary can read
  `Branches: 100%` while lcov still has conditions with a hit count of zero.
  That is how #381 reached Sonar showing `refresh-actions.ts` at 94.4% with
  two uncovered conditions while the local suite reported everything green.
  The two were real: three actions each decode the competition
  independently, and only one of them had been exercised.
- **`toPosixPath`.** `path.join` and `path.relative` answer with backslashes
  on Windows, so without it the guard would match nothing there and report
  every excluded file as a coverage gap. `scripts/executable.ts` documents
  the neighbouring trap.
- **`relativeTo`.** A checkout under a directory containing `.`, `+` or `(`
  would make a regex built from the root match the wrong thing, and the
  failure would look like a coverage gap and not like a path bug. A doubled
  separator is a prefix no lcov path starts with, so nothing would be made
  relative and every excluded file would read as uncovered. The loop avoids
  the quadratic backtracking `breadcrumb.ts` also notes.
- **`SOURCE_SUFFIXES`.** Only `.ts` and `.tsx` exist under `src/` and
  `scripts/` today. The rest are there because the guard's value is that it
  cannot be quietly wrong: a `.mjs` added later would be indexed by Sonar
  and scored, and a guard that did not look at it would report all clear
  while the gate failed.
- **Sonar patterns, not literals.** `tests/**` and `**/*.ico` are both in
  `sonar.exclusions`, and `sonar.coverage.exclusions` is read with the same
  syntax even though every entry there happens to be a literal path.
  Comparing them as strings meant the guard failed the build for files Sonar
  deliberately ignores. The escape comes first so that `drizzle.config.ts`
  does not match `drizzleXconfig.ts`. Hand-written and not `minimatch`: that
  is in `node_modules` only as somebody else's transitive dependency, and a
  build gate should not rest on a package that can vanish when an unrelated
  tree changes.
- **`isPrunedDirectory`.** Testing a sentinel keeps one rule, the patterns,
  where looking for a `dir/**` entry would be a second, simpler rule that
  would drift from it.
- **The count `findCoverageGaps` reports.** A coverage-excluded file that
  some test happens to import appears in the report too, and counting it
  would overstate what was checked in the one line a reader takes at face
  value.

Cut from `scripts/coverage-gaps.ts` at `5b180e0` by #531.

- **`coverage-gaps.ts` reads Sonar's scope.** The guard is there to fail
  locally for the reasons Sonar fails remotely, so a hardcoded list of
  directories would only approximate that: the project scans
  `sonar.sources=.`, the whole repository, minus `sonar.exclusions`. A new
  source file at the root, or in a directory nobody thought of, is scored by
  Sonar and must be seen here too. It runs from `npm run test:unit`, so a
  developer machine fails before a push and not CI after one. Pruning `.git`
  is not worth a line in the project's configuration.
