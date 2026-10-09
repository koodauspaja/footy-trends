# 584 — Test names carry no issue or spec citations: decisions

Chore #584, raised by the hand review of #583 and agreed by Miikka on
2026-10-08. It adds one rule to the check `decisions/531-comments-say-what-code-is-for.md`
built, and overrides nothing in it.

## A name says what the test protects, and nothing else

`it("… (#528, specs/049 S3)")` named its issue and its spec section. #531 put a
test file's decision records in its header, so the same reference in a name was
a second, weaker pointer: a name is printed when a run fails, and `S3` means
nothing to whoever reads that line. The name keeps its sentence and loses the
citation; the header leads to the record, and the record to the spec.

The section number itself is given up on purpose. Nothing else in a test file
says "S14", and nothing should: a spec's sections are renumbered when it is
revised, and the header's record is the way back to it.

## What counts as a citation

| In a name | Example |
|---|---|
| An issue or pull request number | `(#413)`, `from #314`, `per #71` |
| A spec by path or by number | `(specs/049)`, `(specs/026-favourites.md)`, `(spec 003)` |
| A spec section | `(S4)`, `(S9, S14)`, `(S6–S8)` |

The word "spec" without a number is not one: "as the spec words it" says what
the test compares against and points nowhere. Those names are unchanged, as is
"the issue's repro".

## The count was 263, not 100

#584 measured 100 names in 47 files. Read through the TypeScript parser, on
`main` at `898bad5`, there were 263 in 77 files: 232 in `tests/unit`, 22 in
`tests/integration`, 9 in `tests/e2e`. The difference is mostly a section given
alone, `(S4)`, which the first search did not look for. The scope said every
name, so all 263 changed in one pull request.

- 255 lost a trailing citation and nothing else: a bracket at the end of the
  name, or `, from #314`.
- Eight had the citation inside the sentence and were reworded: `#304's explicit
  TEST_DATABASE_URL override` is "an explicit" one, `a pre-#292 .env` is "an
  older .env", `specs/049`, `specs/051` and `specs/032` are named as what they
  built (the home-advantage table, the home-win baseline, the goals panel),
  `as spec 003 has it` is "as the standings after a round do", and `per #71`
  dropped the reference, and `names the match list as agreed on #416` names
  the heading it checks, "Ottelut".

The renames removed and merged no test: 5014 names before and after them, and
no two tests in a file came to share a title that did not already. The only
tests added are the twelve for the check below, in `tests/unit`.

## Where each citation went

Sixty-eight of the 77 files already listed every record their names cited.
Nine gained one in the header, placed by number after the record of the change
that built the file:

| File | Record added |
|---|---|
| `tests/unit/app/domestic/team/[id]/page.test.tsx` | `026-favourites.md` |
| `tests/unit/components/match-prediction.test.tsx` | `049-home-advantage-and-draw-rate.md` |
| `tests/unit/components/season-comparison-section.test.tsx` | `032-goals-scored-vs-conceded.md` |
| `tests/unit/lib/position-series.test.ts` | `003-standings-after-selected-round.md` |
| `tests/unit/lib/season-comparison.test.ts` | `003-standings-after-selected-round.md` |
| `tests/unit/lib/table-volatility.test.ts` | `003-standings-after-selected-round.md` |
| `tests/unit/lib/prediction-backtest.test.ts` | `051-home-win-baseline.md` |
| `tests/unit/lib/test-database-name.test.ts` | `304-test-database.md` |
| `tests/unit/scripts/setup-plan.test.ts` | `292-sonar-zero-open-issues.md` |

Six cited numbers have no record of their own. Each is kept here, since a
comment may not cite an issue:

| Cited | What it was | Where the test's file points now |
|---|---|---|
| #71 | the issue of feature 019, the match page | `019-match-page.md`, already in the header |
| #337 | the issue of feature 044 | `044-scorelines-and-goal-averages.md`, already there |
| #338 | fixture goal average against the league's, built with 044 | the same |
| #478 | the pull request of feature 045; the name credited Sourcery's review there for the test that a club is never its own opponent | `045-bogey-teams.md`, already there |
| #503 | the chore that mounted `GlobalError` as a document in its test | the comments on that test say why |
| #526 | the bug that a Finnish club's page had no favourite star | `026-favourites.md`, added |

## The check

`testNameCitations` in `scripts/comment-rules.ts` reads each `it`, `test`,
`describe` and `suite` call from the parsed tree, through `.each`, `.skip`, `.only` and
Playwright's `test.describe`, and reports a first argument that matches the
table above. `tests/unit/scripts/comment-rules.test.ts` runs it over every file
git tracks or would and fails on any, so there is no record of allowed ones to
shrink: the tree had none left when the check was added.

A fixture string that contains a test call is not a name, which is why this is
read from the tree and not searched for.

Sourcery's review of the first version found two ways past it, and both are
closed as a class:

- **A test function under another name.** The check knows a file's test
  functions from its imports, whatever the module and whatever the local name
  (`import { it as spec }`), and from a constant assigned from one
  (`const serial = test.describe.serial`). A function that is only called
  `describe` and is not imported is not one: `src/lib/test-database-name.ts`
  has such a function, and it takes a database address.
- **A name that is not a string.** `computedTestNames` reports a name given as
  a variable, a call or a sum when a test's body follows it, and the same test
  fails on any. Working out what such a name would say was the other choice;
  the tree had none, so the rule that a name is written where the test is
  costs nothing and needs no evaluator.

What the check does not read: the values put into a template name
(`${team}`), which come from the rows a test loops over, a test function
reached through a namespace import or a destructured constant, and a computed
name whose test body is passed by name and not written in place
(`describe(TITLE, body)`). The tree has none of the last three.

## Nothing selects a test by its name

A renamed test changes what the runner prints. No workflow, script or skill
passes `--grep`, `-t` or a name pattern; `scripts/e2e-freshness-plan.ts` reads
whether a `--grep` was given and never what it matched. There are no snapshot
files, whose keys would have been the names.
