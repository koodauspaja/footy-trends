# Skill: the pass to run before requesting a review

Purpose
Catch the defects this repository's reviews keep finding, before a reviewer has
to. Not general advice: every class below is measured from the review history,
and each has a counter that takes minutes. The table says which to weight
today; it is re-measured, not maintained by hand.

When to use
- Immediately before requesting a Sourcery review or handing a PR to a human.
- After any fix commit, on the part that changed. Findings from a round of
  fixes are as common as findings from the original work.

## Why these classes

Measured on #817 over the last 50 merged pull requests (#689 to #835, to
2026-11-21): of Sourcery's 191 catches, 89 fell in the eleven classes the pass
then had, and the pass itself found 2 defects in about 30 visible runs. Five
classes held 79 of the 89, and only those five stay (decisions/838):

| Findings | Class |
|---|---|
| **34** | **a test that proves nothing** |
| 23 | a comment or spec contradicting the code beside it |
| 10 | a read and a write that do not span one transaction |
| 8 | a failure path dropped, or turned into a plausible wrong value |
| 4 | the same value compared under two normalisations |

The other six classes held 10 between them, and English reaching a Finnish UI
none; they left the pass.

    GH_TOKEN=$(gh auth token) npm run review:findings -- 50

Re-run it. The numbers are a snapshot. A finding is filed by the words it uses,
so a class that reads as zero may have moved to `unclassified`: look before
removing it.

---

## 1. A comment or spec contradicting the code

The largest class, and the one most often written by the same hand that wrote
the code an hour earlier.

**What it looks like.** A comment quoting the class it forbids, and naming the
wrong one. A spec typing a field as `number | null` after the implementation
made it a string. A rule's path patterns claiming a scope its wording does not
have, and the reverse. A count in prose — "all four blocks" — written before a
fifth existed.

**The counter.** First, less to go stale: a comment says what the code beside
it is for in one to three lines, then links the decision records behind it, and
the history goes in the record (`CLAUDE.md`,
`decisions/531-comments-say-what-code-is-for.md`).
`tests/unit/scripts/checks/comment-rules.test.ts` fails on a doc comment stacked on
another, which is how a comment ends up on the wrong function.

Then, any commit that changes behaviour searches for the old
behaviour's *words*, not only its code — the value, the type, the mechanism —
across `specs/`, `decisions/`, comments and tests. A stale sentence is a
contract someone will follow. Prefer a table row to a sentence for anything
countable: #389 got the same count wrong twice in prose.

## 2. A read and a write that do not span one transaction

New in #390, and the largest class once #389's documentation findings are set
aside. Ten findings across three pull requests, all of them in code that had
been read carefully.

**What it looks like.** An approval hash checked against rows read before
`writeSnapshot`, with no lock or transaction spanning the two, so a concurrent
sync is overwritten by the stale approved snapshot. A read, an update and a
readback as three separate statements. A case-insensitive duplicate check that
another transaction can invalidate between the check and the insert. On the
client, the same shape without a database: a preview response applied after the
administrator has changed competition, so the dialog shows one season's diff
while the form submits another's.

**The counter.** For every read whose value decides a later write, name what
stops the state changing in between — a transaction, a lock, a version column,
or a generation counter on the client. If the answer is "nothing usually
does", that is the finding. The window is easy to see once you look for the
pair rather than the statement.

## 3. The same value compared under two normalisations

Also new in #390. Nine findings, four pull requests.

**What it looks like.** `normaliseEmail` lower-casing the operator's input
while `setRole` compares it against a case-sensitive column, so an account
stored with capitals is reported as nonexistent. `path.join` producing
backslashes on Windows while lcov and `sonar.coverage.exclusions` use forward
slashes. An exclusion entry treated as an exact path when Sonar treats it as a
pattern. A diff counting duplicate provider rows while the writer deduplicates
them, so the count shown never matches the rows written.

**The counter.** When a value crosses a boundary — process to database, tool to
tool, provider to store — write down its canonical form once and convert at the
edge, not at each comparison. Then find every other place that compares the
same value: this class arrives in pairs, because the second comparison is what
disagrees with the first.

## 4. A test that proves nothing

**What it looks like.** An escape-hatch e2e that passed with the escape hatch
removed. Focus tests built on 5 ms sleeps. `renderPage()` called twice where
`rerender` was meant. Malformed-id tests run against a competition where the
malformed value was absorbed by a real one. A stylesheet guard that reported
green twice while six offending rules were in the bundle. An EXIF-orientation
test using a solid-colour fixture — a square of one colour is identical
rotated, so it passed with the rotation deleted. A test that asserted the wrong
Finnish notice, and so protected the bug.

**A second shape of the same class: a test that inherits its neighbour.** Found
on #299 by shuffling the suite — 4 runs out of 4 failed, twelve tests in one of
them, while the default order was green. Mock implementations live on the module,
not on the `describe` that set them, and `clearAllMocks` clears *calls* but
leaves implementations and queued `mockReturnValueOnce` results in place. So a
`beforeEach` inside the first `describe` leaves every later one starting from
whatever the previous block's last test happened to configure: a Redis cache hit,
a renamed competition, a stored viewer preference that silently decides both the
default competition and which season parameters parse.

Such a test passes for a reason it does not state, and reordering or renaming one
changes what it asserts. **The counter is `npm run test:shuffle`**, which runs the
unit suite in a shuffled order; anything that fails there is a test whose
arrangement belongs to someone else.

**The counter, and it is not optional: run the mutation.** Break the behaviour
the test names — delete the line, revert the value, remove the guard — and
watch that test fail. Then restore. Twenty seconds. If it does not fail, the
test is decoration, and the mutation has just told you what it actually
asserts.

Every one of the tests above looked right when written. Reasoning does not find
this; running it does.

**Two habits from the same evidence.**

- A fixture that encodes a guess about another system's output is worth
  measuring once. Selector fixtures for Tailwind's escaping were copied out of
  a real build, which caught a wrong guess — `[data-state=open]` is unquoted.
- When the subject is a pipeline, run the real thing. Mocking the image encoder
  would have asserted only that the code calls the functions the code calls.

## 5. A failure path dropped

**What it looks like.** A promise whose rejection escapes the transition that
owns it. A query with no error handling, so one Postgres blip renders an error
page where settings were expected. A failed device lookup turned into an empty
list, which the UI then reported as "you are signed in on this device only" — a
claim about someone's account security, made from a failure.

**The counter.** For each new call that can fail, answer two questions in the
diff: who catches it, and what does the reader see? A failure must never share
a value with "there is nothing" — if a function can fail, its result type
carries failure as its own case.

## The pass itself

1. `GH_TOKEN=$(gh auth token) npm run review:findings` if it has been a while —
   it takes seconds and tells you which of these to weight. Every third or
   fourth merge is often enough.
2. Read the whole diff as if reviewing someone else's work.
3. For every test added: run its mutation.
4. For every call added that can fail: name its catcher and its reader-visible
   outcome.
5. For every behaviour changed: search the repository for sentences describing
   the old one.
6. **`npm run verify`** — lint, typecheck, `test:unit` (100% on all four
   metrics), `test:shuffle`, integration and end-to-end, in that order, stopping
   at the first failure and naming it (#401). End-to-end is due when a hook or
   `skills/open-pr.md` ("e2e and Sourcery rounds") asks for it (decisions/837). The stages are checked against the
   workflows by a unit test, so a green run here is a green CI; running them
   one at a time is the same gate, and the one that gets skipped when they are
   separate commands is always the slow one.

Related: `skills/open-pr.md` for the review gate itself, `REVIEW_RULES.md` for
what Sourcery enforces on the diff.
