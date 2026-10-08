# 592 — Sonar back to zero open issues on main: decisions

Chore #592. On 2026-10-09 Sonar reported 17 open issues on `main`, which #292
had taken to zero, and the quality gate read `OK`.

## Why 17 issues reached main with the gate green

Sonar added rules; nobody merged a defect past the gate.

- The project uses Sonar's built-in profile, `Sonar way comprehensive`. Its
  TypeScript rules were last updated on 2026-09-29, and the three TypeScript
  rules behind 14 of the 17 (`S9382`, `S9383`, `S7503`) were created in Sonar
  on that day.
- Sonar dates an issue by the age of its line, so the 14 carry dates from
  2026-08-13 to 2026-09-28. Every condition of the gate is on new code, and a
  line written in August is not new code.
- The three `yaml:S2068` findings are older, from 2026-08-08 and 2026-08-28,
  and were last updated on 2026-09-27. What changed then could not be read
  from the public API: the rule dates from 2025 and the issues have no
  changelog there.

So the gate cannot catch this: it judges a pull request's own lines, and a rule
Sonar adds later lands on old ones. Proposed and not done here, because it
changes what blocks a merge: a check that reads the open count on `main` from
Sonar's API and fails when it is not zero, run on a schedule and not on a pull
request, so that a new rule becomes an issue the day it arrives and not a
surprise. That is a follow-up to agree.

## Six fixed in the code

| Finding | Fix |
|---|---|
| `S9383`, `settings-page.tsx`, twice: `refetch()` after an avatar save and after a removal | A real defect, small. The promise was neither awaited nor caught, so a session that could not be re-read became a rejection nobody handled. It is caught and ignored: the write stood and is already reported, and the header shows the old picture until the session is next read. Not awaited, unlike the start-region save, which has a notice for exactly this and the picture has none |
| `S7503`, `next.config.ts`, `rewrites` and `redirects` | Next wants a promise from each, and neither awaits anything: they return `Promise.resolve(…)` |
| `S7503`, `scripts/preflight.ts` | the probe handed to `wait` wraps a synchronous answer in `Promise.resolve` |
| `S9382`, `scripts/issue-boxes-steps.ts` | the issues one pull request closes are read together. There are one or two, order does not matter, and the verdicts keep the issues' order |

The test for the avatar defect needed the mocked `refetch` wrapped in a
function of its own. A Vitest mock handles the rejection of the promise it
returns, to record how it settled, so the component ignoring that promise went
unseen; the first version of the test passed without the fix.

## Eleven that are not defects

Closed in `sonar-project.properties` with `sonar.issue.ignore.multicriteria`:
one rule, in the files named, and nowhere else (Miikka, 2026-10-09). Accepting
each in Sonar's interface is exact per issue, but the reason would live outside
the repository; a comment on each line would exist for the tool. The cost of
this way is that a new finding of the same rule in the same file will not show.

**Eight loops that run in order on purpose** (`typescript:S9382`). The rule
asks for `Promise.all`, which is wrong for each:

| File | Why the loop is sequential |
|---|---|
| `scripts/backfill-run.ts`, five | every request goes through a pacer set to the provider's requests per minute, and the output is one line per season, in order, with a failure on the line of the season it happened in |
| `scripts/review-findings.ts` | one request per merged pull request to GitHub, which limits bursts; the error names the pull request being read |
| `scripts/services-plan.ts`, `waitFor` | a poll: probe, sleep, probe again until a deadline. There is nothing to run together |
| `src/lib/provider-request.ts` | a retry: the next attempt exists only because the last one was rate limited, after the wait the provider asked for |

**Three times the CI database's password** (`yaml:S2068`), in `ci.yml` and
twice in `release.yml`: `POSTGRES_PASSWORD: postgres` on the service container
a workflow run starts and throws away. It guards nothing, is reachable only
from the runner, and a real credential in a workflow is `${{ secrets.… }}`,
which the rule does not read. Ignoring the rule in those two files does mean a
literal password added to them later would not be reported.

## Sonar's own suggestion, where it was not taken

As `decisions/292-sonar-zero-open-issues.md` found for a sort, the fix a rule
suggests can be worse than what it flags. Running the backfill's requests
together is that case here.
