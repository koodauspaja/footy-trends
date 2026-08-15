# Skill: end-to-end bug workflow

Purpose
Use this skill for fixing a bug — behavior that deviates from what's already
specified or obviously intended, as opposed to new product work.

Bugs go directly from a GitHub issue to a pull request. They do not require a
new feature spec. Reference the existing spec that describes the correct
behavior, if one governs the broken area. A decision record is not required
by default, but write one if the fix involves a genuinely non-obvious
tradeoff — the same latitude already given to chores and to judgment calls
made during feature work.

When to use
- A bug issue is ready to be implemented.
- The behavior deviates from an existing spec, documented decision, or
  otherwise obviously-intended behavior — not a request for new behavior.
- If it's unclear what "correct" even means here, this is not a bug: stop
  and figure out whether it's actually a feature gap needing a spec.

Workflow
1. Read the GitHub issue in full.
   - Confirm what happened, what should happen instead, and the repro steps.
   - If the issue references an existing spec (`specs/NNN-feature-name.md`),
     read it to confirm what "correct" means here.
   - If the issue is ambiguous or missing required information, ask for
     clarification before implementation.
2. Check the issue's status on the `Footy Trends` GitHub Project board. It
   must be in the `Ready` column ("Spec written and validated — ready for
   Claude Code" — see `docs/setup/002-github-project-board.md`) before any
   implementation begins.
   - If the issue is in `Backlog` or any other column, stop. Do not create a
     branch or write code. Confirm the scope with the user and ask them to
     move the card to `Ready` (or move it yourself only if the user
     explicitly says to) before continuing.
   - This applies even after scope has just been clarified in chat —
     agreeing on scope in conversation is not the same as the card being
     `Ready`, and does not substitute for it.
   - Once confirmed `Ready`, move the card to `In Progress` before creating
     a branch or writing any code.
3. Create a bug branch named `bug/NNN-short-description`.
4. Fix the root cause, not just the symptom. Keep the change scoped to the
   bug — do not fold in unrelated cleanup or refactoring.
   - Keep code, comments, and documentation in English.
5. Add or update a test that fails before the fix and passes after —
   ideally the exact scenario from the issue's repro steps. A bug fix
   without a regression test is incomplete, unless the bug has no
   executable behavior to test against (a docs typo, a comment, a
   config value with no automated check reading it) — in that case, say
   so explicitly in the PR rather than silently skipping the step.
6. Run the relevant validation for the changed surface.
   - For TypeScript or application changes, run `npm run typecheck`.
   - For lint-sensitive changes, run `npm run lint`.
   - For behavior changes, run `npm test`.
   - Run all three when the change crosses multiple surfaces or when the
     issue does not define narrower checks.
7. Decide whether a decision record is warranted:
   - Default: no. Most bug fixes are a straightforward correction with
     nothing worth recording beyond the issue and the diff itself.
   - Write one (`decisions/NNN-bug-name.md`) only if the fix involved a
     real tradeoff — for example, multiple valid remediation approaches,
     a deliberate deviation from the obvious fix, or a root cause that
     surprised the investigation. If in doubt, ask the user rather than
     guessing either way.
8. Commit the change with a conventional commit message that references the
   issue, for example: `fix: correct season rollover off-by-one (#NNN)`.
9. Push the bug branch and open a pull request against `main`.
   - Link the originating GitHub issue with a closing keyword — `Closes #NNN`
     (or `Fixes #NNN` / `Resolves #NNN`), never a bare `#NNN` or `Refs #NNN`.
     Only a closing keyword makes GitHub populate the PR↔issue link; the
     link is mandatory even though the issue auto-closing on merge is just
     an accepted side effect of it. See `skills/open-pr.md` for the full
     rationale.
   - Link the existing spec the bug violated, if the issue named one.
     Otherwise mark the Spec section `Not applicable - bug`.
   - Mark the Decision record section `Not applicable - bug` unless step 7
     produced one, in which case link it.
   - Summarize what was broken, the root cause, and the fix.
   - List the validation commands and their results, and how to reproduce
     the original bug to confirm it's gone.
   - Move the card to `In Review` once the pull request is open.
10. Leave the pull request for human review. Do not merge it yourself.

Important rules
- This workflow intentionally does not use `skills/write-spec.md` or create a
  new file under `specs/` — a bug fix corrects behavior against what's
  already specified or intended, it doesn't specify new behavior.
- This workflow does not create a file under `decisions/` by default; see
  step 7 for the exception.
- Never begin implementation (branch creation, code, or tests) before the
  issue's Project board status is `Ready`. Confirming scope in chat is a
  precondition for moving the card to `Ready`, not a substitute for it — the
  two are separate checkpoints.
- User-facing UI strings must be in Finnish.
- Do not commit secrets, generated artifacts, or unrelated changes.
- If the fix turns out to require new, unspecified behavior rather than a
  correction, stop and switch to `skills/feature-workflow.md` before
  continuing.
