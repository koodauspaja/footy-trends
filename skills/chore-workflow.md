# Skill: end-to-end chore workflow

Purpose
Use this skill for maintenance work that does not introduce a product feature,
such as dependency updates, documentation changes, tooling changes, CI changes,
refactoring, or repository configuration.

Chores go directly from a GitHub issue to a pull request. They have no feature
spec, and write a decision record whenever they change something meaningful.

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
   must be in the `Ready` column ("Issue written and validated — ready for
   Claude Code" — see `docs/setup/002-github-project-board.md`) before any
   implementation begins.
   **Work is authorised by either of these, and either one alone is enough:**

   - a human has moved the card to `Ready` — the column means "ready for
     Claude Code", so its presence is the authorisation; or
   - the human says to start. No particular wording is required: "looks good,
     update issue and start work", "you can go ahead with the implementation"
     and "issue in ready now" all count.

   Until one of them is true: no branch, no code, no migration, no board
   change — including no move to `In Progress`. Agreeing the scope in
   conversation is not either of them, and neither is the AI's own reading of
   the situation.

   - **Never start without having asked whether the issue is good and been
     answered.** A human-set `Ready` card *is* an answer — putting it there is
     the human saying they read the issue and approved it, so the question has
     already been put and settled. In every other situation, ask, and wait.
     The same rule as `skills/feature-workflow.md` step 4; it applies to chores
     and bugs too, where being told to move the card and start is the common
     case.
   - **When the AI sets `Ready` itself, it must quote the sentence it is acting
     on, in the same message** — as evidence, not as a password. The quote must
     read plainly as an instruction to start. A question about what comes next,
     permission to reshape the work, or silence is not one.
   - **The card passes through `Ready` either way.** If the human moved it
     there, nothing to do. If they authorised the start without moving it, move
     it to `Ready` first — quoting the sentence being acted on — so the board
     still records that a human approved the work. Then `In Progress`, then the
     branch.
3. Create a chore branch named `chore/NNN-short-description` when an issue
   number exists. For unnumbered maintenance work, use
   `chore/short-description`.
4. Inspect the affected code, configuration, or documentation and make the
   smallest change that satisfies the issue.
   - Before changing code, look up why it is the way it is: the decision
     records its comments link to, then `decisions/` and `specs/` searched for
     its file and function names, then its history (`git log -L`, `git log -S`).
     A normal step of every change, not a fallback.
   - Keep code, comments, and documentation in English, and comments in the
     shape `CLAUDE.md` gives.
   - When the chore changes something meaningful, write
     `decisions/NNN-short-name.md`, numbered by the issue. Records are added,
     not edited: a later one says which earlier one it overrides.
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
8. **Tick the issue's checkboxes before opening the pull request.** Go through the
   issue's checklist sections — Acceptance criteria always, plus Scope
   where the template has it — and mark each box that is done.

   A box is ticked because the outcome was **verified**, not because the code
   was written — if a criterion says a page renders something, load it and
   look. Where a criterion cannot be ticked honestly, say so on the issue
   rather than leaving it silently blank or ticking it anyway.

   **Do it before the pull request is opened**, not after. `npm run
   check:boxes` reads the issue on every pull request through CI's `Issue
   checkboxes` job (#463), and GitHub does not re-run a check when an issue is
   edited — so a box ticked afterwards leaves a stale red result until someone
   re-runs the job.

   A criterion that cannot be ticked honestly says so **on the box**, after an
   em dash and in bold, which is the shape that check reads:

   ```
   - [ ] The criterion — **not ticked: it needs a live page, and I have not
         looked.**
   ```

   This is as much a check on the work as a record of it: a criterion that
   resists ticking usually means something was missed. It is easy to skip
   because nothing fails when you do — #158 was implemented, verified, merged
   and closed with all eight boxes empty.

9. Push the chore branch and open a pull request against `main`.
   - **Before the push, review your own diff**: the pass in
     `skills/self-review.md` and the `code-review` skill at its lowest effort,
     with what they find fixed first, per `skills/open-pr.md` step 5. The pull
     request's Checklist has a box for it.
   - **When the chore has an issue**, link it with a closing keyword —
     `Closes #NNN` (or `Fixes #NNN` / `Resolves #NNN`), never a bare `#NNN` or
     `Refs #NNN`. Only a closing keyword makes GitHub populate the PR↔issue
     link; the link is mandatory even though the issue auto-closing on merge is
     just an accepted side effect of it. See `skills/open-pr.md` for the full
     rationale.

     A trivial chore may legitimately have no issue at all — step 3 says so,
     and `npm run check:boxes` passes a pull request that closes none for the
     same reason. Then there is nothing to link, and nothing to tick.
   - Summarize what changed and why.
   - List the validation commands and their results.
   - Mark the Spec section `Not applicable - chore`. Link the decision record,
     or mark that section `Not applicable - chore` when there is none.
   - Do not create placeholder files in `specs/` or `decisions/`.
   - Move the card to `In Review` once the pull request is open.
10. Leave the pull request for human review. **Never merge on your own
    initiative** — however green it is. Merge only when a human tells you to;
    that instruction is the allowed final step, not an exception to the rule.
    Before handing it off, apply the Sourcery review gate in
    `skills/open-pr.md` — a `skipped` Sourcery check is a hard block unless
    every changed path is on that document's short allowlist of unreviewable
    files (documentation and workflows are **not** on it), unresolved review
    threads must be read immediately before merging, and the quick check
    after a push is not a full review: `npm run check:sourcery -- <PR>` says
    which one the head has, and must exit 0. Either Miikka or Kalle may be the
    reviewer.

Important rules
- Never hand off or merge a pull request while its issue still has unticked
  boxes that are in fact done. Ticking them is part of finishing the work,
  not paperwork afterwards.
- This workflow intentionally does not use `skills/write-spec.md` or create a
  file under `specs/`.
- A file under `decisions/` is written only when the chore changes something
  meaningful, and never as a placeholder.
- Never begin implementation (branch creation, code, or tests) before the work
  is authorised — a human-set `Ready` card, or a human saying to start.
  Confirming scope in chat is neither of those. The AI never moves a card to
  `Ready` on its own initiative, and when instructed to, it quotes the
  instruction.
- User-facing UI strings must be in Finnish.
- Do not commit secrets, generated artifacts, or unrelated changes.
- If the work grows into a user-facing feature or needs product decisions,
  stop and switch to `skills/feature-workflow.md` before continuing.