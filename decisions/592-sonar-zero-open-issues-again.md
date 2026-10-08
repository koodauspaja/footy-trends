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

## Eight fixed

| Finding | Fix |
|---|---|
| `S9383`, `settings-page.tsx`, twice: `refetch()` after an avatar save and after a removal | A real defect, small. The promise was neither awaited nor caught, so a session that could not be re-read became a rejection nobody handled. It is caught, and the reader is told: the write stood and is reported as done, and under it "Päivitä sivu, jotta muutos näkyy tilivalikossa." says the header still shows the old picture, as the start-region save says for the same failure. The first version caught it and said nothing, which Sourcery's review rightly called a silent failure. Not awaited: the save is reported before the session answers |
| `S7503`, `next.config.ts`, `rewrites` and `redirects` | Next wants a promise from each, and neither awaits anything: they return `Promise.resolve(…)` |
| `S7503`, `scripts/preflight.ts` | the probe handed to `wait` wraps a synchronous answer in `Promise.resolve` |
| `yaml:S2068`, `ci.yml` once and `release.yml` twice: `POSTGRES_PASSWORD: postgres` on the Postgres container a run starts and throws away | No workflow holds a password now. The container's password and the `DATABASE_URL` beside it read the repository secret `CI_POSTGRES_PASSWORD`, a random value nobody needs to know (Miikka, 2026-10-09). The rule still reads both files |

The test for the avatar defect needed the mocked `refetch` wrapped in a
function of its own. A Vitest mock handles the rejection of the promise it
returns, to record how it settled, so the component ignoring that promise went
unseen; the first version of the test passed without the fix.

## Nine loops that run in order on purpose

`typescript:S9382` asks for `Promise.all`, which is wrong for each. Closed in
`sonar-project.properties` with `sonar.issue.ignore.multicriteria`: that one
rule, in the five files named, and nowhere else (Miikka, 2026-10-09).
Accepting each in Sonar's interface is exact per issue, but the reason would
live outside the repository; a comment on each line would exist for the tool.
The cost is that a new loop in one of these files which could run together
will not be pointed out.

| File | Why the loop is sequential |
|---|---|
| `scripts/backfill-run.ts`, five | every request goes through a pacer set to the provider's requests per minute, and the output is one line per season, in order, with a failure on the line of the season it happened in |
| `scripts/review-findings.ts` | one request per merged pull request to GitHub, which limits bursts; the error names the pull request being read |
| `scripts/issue-boxes-steps.ts` | one request per issue a pull request closes, to the same API |
| `scripts/services-plan.ts`, `waitFor` | a poll: probe, sleep, probe again until a deadline. There is nothing to run together |
| `src/lib/provider-request.ts` | a retry: the next attempt exists only because the last one was rate limited, after the wait the provider asked for |

## What the first version of this change got wrong

It ignored `yaml:S2068`, the hard-coded credential rule, for the whole of
`ci.yml` and `release.yml`, to close the three findings on the CI database's
password. That switched off credential detection in the two files where a
leaked secret is most likely to be written, to silence a placeholder. The
record of that version named the cost and went ahead anyway; Sourcery's review
called it high, and it was. A security rule is not ignored by file here: the
thing it flags is removed, as above.

The second version made the password the run's own id. Sonar was satisfied,
and the review rule on credentials was not: a credential comes from the
environment, and a value built in the workflow is still one the workflow
holds. Hence the secret.

The same version read the issues of a pull request together. The loop was not
a defect and the change bought nothing but a closed finding, so it is back as
it was and its file is in the table.

## Sonar's own suggestion, where it was not taken

As `decisions/292-sonar-zero-open-issues.md` found for a sort, the fix a rule
suggests can be worse than what it flags. Running the backfill's requests
together is that case here.
