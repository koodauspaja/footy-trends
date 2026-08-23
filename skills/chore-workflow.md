# Skill: end-to-end chore workflow

Purpose
Use this skill for maintenance work that does not introduce a product feature,
such as dependency updates, documentation changes, tooling changes, CI changes,
refactoring, or repository configuration.

Chores go directly from a GitHub issue to a pull request. They do not require a
feature spec or a decision record.

When to use
- A chore issue is ready to be implemented.
- The work is operational, structural, or maintenance-focused rather than a
  user-facing feature.
- The issue provides enough context to define the change and its acceptance
  checks.

Workflow
1. Read the GitHub issue in full.
   - Confirm the requested scope, constraints, and acceptance criteria.
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
3. Create a chore branch named `chore/NNN-short-description` when an issue
   number exists. For unnumbered maintenance work, use
   `chore/short-description`.
4. Inspect the affected code, configuration, or documentation and make the
   smallest change that satisfies the issue.
   - Keep code, comments, and documentation in English.
   - Preserve existing project conventions and avoid unrelated cleanup.
5. Add or update focused tests when the chore changes executable behavior.
6. Run the relevant validation for the changed surface.
   - For TypeScript or application changes, run `npm run typecheck`.
   - For lint-sensitive changes, run `npm run lint`.
   - For behavior changes, run `npm test`.
   - Run all three when the change crosses multiple surfaces or when the issue
     does not define narrower checks.
7. Commit the change with a conventional commit message that references the
   issue when applicable, for example:
   `chore: update development documentation (#NNN)`.
8. Push the chore branch and open a pull request against `main`.
   - Link the originating GitHub issue with a closing keyword — `Closes #NNN`
     (or `Fixes #NNN` / `Resolves #NNN`), never a bare `#NNN` or `Refs #NNN`.
     Only a closing keyword makes GitHub populate the PR↔issue link; the
     link is mandatory even though the issue auto-closing on merge is just
     an accepted side effect of it. See `skills/open-pr.md` for the full
     rationale.
   - Summarize what changed and why.
   - List the validation commands and their results.
   - Mark the Spec and Decision record sections as `Not applicable - chore`.
   - Do not create placeholder files in `specs/` or `decisions/`.
   - Move the card to `In Review` once the pull request is open.
9. Leave the pull request for human review. Do not merge it yourself.
   Before handing it off, apply the Sourcery review gate in
   `skills/open-pr.md` — a `skipped` Sourcery check is a hard block, and a
   light re-check after fix commits is not a full review. Either Miikka or
   Kalle may be the reviewer.

Important rules
- This workflow intentionally does not use `skills/write-spec.md` or create a
  file under `specs/`.
- This workflow intentionally does not create a file under `decisions/`.
- Never begin implementation (branch creation, code, or tests) before the
  issue's Project board status is `Ready`. Confirming scope in chat is a
  precondition for moving the card to `Ready`, not a substitute for it — the
  two are separate checkpoints.
- User-facing UI strings must be in Finnish.
- Do not commit secrets, generated artifacts, or unrelated changes.
- If the work grows into a user-facing feature or needs product decisions,
  stop and switch to `skills/feature-workflow.md` before continuing.