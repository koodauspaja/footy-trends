# Skill: the pass to run before requesting a review

Purpose
Catch the defects this repository's reviews keep finding, before a reviewer has
to. Not general advice — seven classes, each measured from the review history,
each with a counter that takes minutes.

When to use
- Immediately before requesting a Sourcery review or handing a PR to a human.
- After any fix commit, on the part that changed. Findings from a round of
  fixes are as common as findings from the original work.

## Why these seven

Measured with `npm run review:findings`, which counts every Sourcery inline
comment on recent merged pull requests and sorts it by class. On 2026-09-08,
across the last 14 merged PRs:

| Findings | Class | Pull requests |
|---|---|---|
| **11** | **a test that proves nothing** | #265 #267 #270 #275 #279 #283 #285 |
| 9 | a parser accepting what it should not | #282 #283 #285 |
| 8 | a failure path dropped, or turned into a plausible wrong value | #265 #267 #270 #283 |
| 6 | a comment or spec contradicting the code beside it | #270 #276 #283 |
| 2 | English reaching a Finnish UI | #270 |
| 1 | a guard covering the named line instead of the class | #265 |
| 11 | unclassified | #265 #270 #282 #283 |

    GH_TOKEN=$(gh auth token) npm run review:findings -- 14

Re-run it. The numbers are a snapshot, and a class that stops appearing has
earned its removal from this document as much as a new one earns its place.

**`unclassified` is a quarter of the total, and that is the honest number.** A
finding is filed by the words it uses, so the table is a coarse indicator of
where to look — not a verdict on any one finding, and no substitute for reading
them.

---

## 1. A test that proves nothing

The largest class, and present in seven different pull requests — more than any
other.

**What it looks like.** An escape-hatch e2e that passed with the escape hatch
removed. Focus tests built on 5 ms sleeps. `renderPage()` called twice where
`rerender` was meant. Malformed-id tests run against a competition where the
malformed value was absorbed by a real one. A stylesheet guard that reported
green twice while six offending rules were in the bundle. An EXIF-orientation
test using a solid-colour fixture — a square of one colour is identical
rotated, so it passed with the rotation deleted. A test that asserted the wrong
Finnish notice, and so protected the bug.

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

## 2. A failure path dropped

**What it looks like.** A promise whose rejection escapes the transition that
owns it. A query with no error handling, so one Postgres blip renders an error
page where settings were expected. A failed device lookup turned into an empty
list, which the UI then reported as "you are signed in on this device only" — a
claim about someone's account security, made from a failure.

**The counter.** For each new call that can fail, answer two questions in the
diff: who catches it, and what does the reader see? A failure must never share
a value with "there is nothing" — if a function can fail, its result type
carries failure as its own case.

## 3. A parser accepting what it should not

**What it looks like.** `Number("")` is `0`, `Number("0x10")` is 16,
`Number.parseInt("2abc")` is 2. A class-name pattern that stopped at the first
bracket. A regex anchored so a variant prefix walked past it.

**The counter.** Write down what the field *is* — "a positive decimal integer
the column can hold" — then test the boundary from both sides: the largest
accepted value and the smallest rejected one. And put the rule in one place;
this class arrived three pull requests running, on two copies of a rule that
had drifted apart.

## 4. A comment or spec contradicting the code

**What it looks like.** A comment quoting the class it forbids, and naming the
wrong one. A spec typing a field as `number | null` after the implementation
made it a string. A comment describing alpha tints after tokens replaced them.

**The counter.** Any commit that changes behaviour searches for the old
behaviour's *words*, not only its code — the value, the type, the mechanism —
across `specs/`, `decisions/`, comments and tests. A stale sentence is a
contract someone will follow.

## 5. A guard covering the named line

**What it looks like.** A validation added where the diagnostic reads the
value, while the path that *stores* it parses the same value independently and
keeps its own copy of the rule.

**The counter.** After fixing the reported line, grep for every other reader of
the same input. If there are two, the fix is one shared function, not two
guards — see `feedback: remove the path, do not add a guard` in the review
history.

## 6. English reaching a Finnish UI

CLAUDE.md makes this a hard rule, and review has still had to say it twice — a
rule that is only written down is not a check.

**The counter.** Read every new string a reader can see. Browser and
platform names, provider errors and library defaults are the usual leaks.

## 7. A shared key that is not per-reader

**What it looks like.** `/api/avatar/me?v=<timestamp>` — one path for every
reader, cached `private, immutable` for a year, with a query parameter that two
readers could hold identically. Switching accounts in one browser profile would
have served the first reader's picture to the second, without the authenticated
route being asked at all.

**The counter.** For anything cached, name the two things separately: what makes
it change when the content changes, and what keeps one reader's copy off another
reader's URL. A per-user timestamp answers the first and not the second. If one
value has to do both jobs, it has to be unguessable and unique — not merely
fresh.

---

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
6. `npm run lint`, `npm run typecheck`, `npm run test:unit` (100% on all four
   metrics), `npm run test:integration`, `npm run test:e2e`.

Related: `skills/open-pr.md` for the review gate itself, `REVIEW_RULES.md` for
what Sourcery enforces on the diff.
