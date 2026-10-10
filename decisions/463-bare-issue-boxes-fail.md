# 463 — The handoff fails when an issue's boxes are bare: decisions

Chore #463 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/issue-boxes-plan.ts` at `5b180e0` by #531.

- **The rule in `issue-boxes-plan.ts`.** Not "every box is ticked". A
  criterion that cannot be ticked honestly is supposed to say so on the
  issue, and four issues already did (#448, #426, #406 and #400 write the
  reason inline, after an em dash, in bold), so the checkable property is
  the pair: a bare box has neither a tick nor a reason. A script and not
  another paragraph: the rule was already written in the one file loaded
  every session, and #158 and #425 were both merged and closed with every
  box empty anyway. Nothing failed when it was skipped. Being pure makes the
  rule testable without a network or a repository.
- **`CLOSING_KEYWORD`.** A `Closes #N` written in prose closes the issue
  just the same.
- **`FENCE`.** An issue explaining this very convention would otherwise be
  reported as having a bare box: the check calling a document about itself a
  failure. Raised in review on #468.
- **`HEADING`.** Testing `startsWith("#")` got two things wrong in one line:
  an indented heading could explain the box above it, and a wrapped reason
  beginning `#tag` was cut off from the box it belonged to. Raised in review
  on #468.
- **`REASON` is a shape.** `- [ ] … — **not ticked: …**` and
  `- [ ] … — **the six issues exist; no spec is written yet …**` both count:
  insisting on the phrase "not ticked" would reject #426, which is a model
  of the thing the check wants.
- **`closedIssues`.** A pull request may close a feature and a chore at the
  same time, and each one's boxes are its own.
- **`boxesIn`.** A reason often wraps: GitHub stores the body as typed, and
  #400's runs onto the next line. Reading only the first line would call an
  explained box bare, the one verdict the check must never get wrong. A
  blank line ends the item, so a paragraph after it belongs to the issue and
  not to the box above; reading `boxes.at(-1)` each time let exactly that
  paragraph explain a bare box.
- **`report` names every box.** For the reason `coverage-gaps.ts` names
  every missing file: a number tells you to go and look, a list tells you
  where.
- **`ADVICE`.** The instruction is the rule itself and not "tick them": a
  box ticked to clear a red check is the failure the whole thing exists to
  catch.

Cut from `scripts/issue-boxes.ts` at `5b180e0` by #531.

- **`issue-boxes.ts`.** The rule is in `issue-boxes-plan.ts` and the
  sequence in `issue-boxes-steps.ts`, both unit tested; `runWhenMain` starts
  the check only when Node was pointed at this file.

Cut from `scripts/issue-boxes-steps.ts` at `5b180e0` by #531.

- **`issue-boxes-steps.ts`.** The rule is in `issue-boxes-plan.ts`; with
  the reading injected, a test exercises the whole sequence without a
  network. HTTPS for the reason `review-findings.ts` gives: the command a
  script runs should not depend on what happens to be earliest in someone's
  `PATH`.
- **A pull request that closes no issue.** A trivial chore is allowed to
  have neither issue nor board card (`skills/chore-workflow.md`), and a
  check that demanded one would be enforcing a rule the repository does not
  have.
