# Skill: end-to-end feature workflow

Purpose
Use this skill when you need a single, explicit path for taking a feature from
idea to merged code with a mostly autonomous AI implementation flow.

When to use
- At the start of a new feature.
- When you need to know which supporting skill to use next.
- When the workflow needs to be explained to a human contributor or another AI
  agent.

Workflow
1. Human writes or refines the feature spec in `specs/NNN-feature-name.md`.
   - The AI may assist with drafting and structuring the spec, but the human
     remains responsible for the final content and intent.
   - If the spec is incomplete, use `skills/write-spec.md` to check the
     required sections before you proceed.
2. Human verifies that the spec is complete enough for implementation.
   - Confirm the spec checklist in chat or in review before any implementation
     begins.
3. Create or update the GitHub issue using `skills/open-issue.md`, then check
   its status on the `Footy Trends` GitHub Project board. It must be in the
   `Ready` column ("Spec written and validated — ready for Claude Code" — see
   `docs/setup/002-github-project-board.md`) before any implementation
   begins.
   - Chat confirmation of the spec checklist (step 2) is what makes moving
     the card to `Ready` valid — do not move it before that confirmation.
   - If the issue is in `Backlog` or any other column, stop. Do not create a
     branch or write code. Confirm with the user and ask them to move the
     card to `Ready` (or move it yourself only if the user explicitly says
     to) before continuing.
   - Once confirmed `Ready`, move the card to `In Progress` before creating
     a branch or writing any code.
4. AI proceeds autonomously from there.
   - Create the implementation branch and begin work without waiting for
     additional handholding unless the spec is unclear or blocked.
5. AI implements the feature autonomously within the bounds of the spec.
   - Use `skills/implement-feature.md` for the implementation, testing, and
     decision-record steps.
6. AI writes or updates the decision record while implementing.
   - The human should review it before final approval.
7. AI runs the relevant verification checks and prepares the change for review.
   - This includes tests, linting, type checking, and any relevant local
     validation.
8. AI opens a pull request.
   - Use `skills/open-pr.md` for the PR workflow.
   - Move the card to `In Review` once the pull request is open.
9. Human reviewers approve and merge.
   - The AI supports the process, but humans own the review and merge decision
     in GitHub.

Important rules
- User-facing UI strings must be in Finnish.
- Code, comments, specs, and decision records should be in English.
- If required information is missing, stop and ask rather than guessing.
- The spec is the source of truth; implementation should not diverge from it
  without clear explanation in the decision record.
- Never begin implementation (branch creation, code, or tests) before the
  issue's Project board status is `Ready`. Confirming the spec checklist in
  chat is a precondition for moving the card to `Ready`, not a substitute
  for it — the two are separate checkpoints.
- Once the spec is confirmed and the card is `Ready`, the AI should continue
  through the workflow without requiring repeated human instruction for
  routine tasks such as branch creation, testing, and PR preparation.
