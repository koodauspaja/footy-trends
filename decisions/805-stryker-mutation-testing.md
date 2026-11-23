# 805 — StrykerJS was tried and is not kept: decisions

Chore #805. Every new test's mutation is checked by hand before review (`skills/self-review.md`), and "a test that proves nothing" stays the largest class of review findings (34 of 191 over 50 pull requests, measured on #817). On #817 Miikka decided to hand that self-review class to mutation testing if this trial kept StrykerJS. It does not.

## The trial

StrykerJS 10.1.1 with its Vitest runner, against the unit tests only (`tests/unit`, the integration project left out because its guard refuses any database but its own), `coverageAnalysis: "perTest"`, every mutator on. A script mutated the source files a branch changed against `origin/main`. Run on 2026-11-23 on a laptop with 11 cores.

| Run | Files | Mutants | Killed | Timeout | Survived | Score | Survivors on lines the pull request changed | Wall time |
|---|---|---|---|---|---|---|---|---|
| The trial's own script, `mutation-plan.ts` | 1 | 25 | 23 | 0 | 2 | 92.00 % | 2 of 2: its tests did not check the path regex's `^` or `$`. Fixed, then 25 of 25 | 10 s |
| #866 at `16a6ec0`, the head Sourcery first reviewed | 5 | 597 | 522 | 1 | 74 | 87.60 % | 0 of 74, on the 33 lines it changed | 153 s |
| #872 at `cf8abb7`, `src/lib/taso/taso-sync.ts` | 1 | 209 | 165 | 0 | 44 | 78.95 % | 0 of 44, on the 5 lines it changed | 45 s |

- **Sourcery's finding on #866 was not among the survivors.** It was a test that proved nothing: the page tests asked for the same season as the active one, so passing the selected season instead still passed. StrykerJS has no mutator that puts one variable in place of another, so it never makes that mutant.
- **The survivors were in code the pull requests did not touch.** Mutating whole files reports every gap in them. #866's included real ones, such as no page test of the pass-through notice, but none bore on reviewing that change.
- **35 of #872's 44 survivors were SQL fragments**, such as an upsert's `sql\`excluded.group_id\`` emptied. The unit tests mock the database and cannot see them; that is the integration suite's ground.
- **Route folders need escaping.** `--mutate` takes globs and turns a backslash into a path separator, so `[id]` matched nothing until each glob character became a one-character class (`[[]id[]]`).

| Decision | Why |
|---|---|
| **StrykerJS is not kept**: no dependency, configuration or script reaches `main` | As an extra step it adds two dependencies to keep current, a run of 10 to 150 seconds with every core busy, and survivors in untouched code to read. On two merged pull requests it found nothing on their changed lines and missed the one finding of this class Sourcery made. Miikka, 2026-11-23: "the extra complexity and maintenance cost is too high and we do have a pretty well working system on our own" |
| **The self-review class stays manual**, as `skills/self-review.md` has it | The trial gives no reason to hand it over, and the finding class is mostly the substitution StrykerJS cannot make |
| **No mutator was switched off** | Nothing was kept to tune. The string mutator's survivors were noise in `taso-sync.ts` and meaningful in #866 (`group.kind === ""`), so switching it off would not have been the fix either |
| **Where it could come back** | If mutating only a pull request's changed lines became cheap, through `--mutate file:start-end` ranges, or a tool learned to swap variables, the cost and the catch would both change. Either would be a new chore with its own trial |
