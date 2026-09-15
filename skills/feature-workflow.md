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
   - Confirmation happens **in chat**: every open question is answered, and
     the human says **go**.
   - The AI never declares this itself. Engagement is not agreement —
     "what's next?", "do you have what you need?", "splitting it is fine",
     and silence are all *not* a go.
3. **After the go**, create or update the GitHub issue using
   `skills/open-issue.md`, so it carries the spec's scope and acceptance
   criteria.
   - The issue is how the spec reaches the people who approve it. They read
     the issue, not the chat, and not files on the AI's machine.
4. **Never start without having asked whether the issue is good and been
   answered.** A human-set `Ready` card *is* an answer — putting it there is the
   human saying they read the issue and approved it. In every other situation,
   ask, and wait.
   - The human decides whether to read it, then authorises the start. **Either
     of these alone is enough:** a human moves the card to `Ready` — the column
     means "ready for Claude Code", so its presence is the authorisation — or
     the human says to start, in any wording.
   - Until one of those arrives: no branch, no code, no migration, no board
     change.
   - No particular wording is required. "looks good, update issue and start
     work", "you can go ahead with the implementation" and "issue in ready now"
     are all a start.
   - **When the AI sets `Ready` itself, it must quote the sentence it is acting
     on, in the same message** — as evidence, not as a password. The quote must
     read plainly as an instruction to start. A question about what comes next,
     permission to reshape the work, or silence is not one.
   - **The card passes through `Ready` either way.** If the human moved it
     there, nothing to do. If they authorised the start without moving it, the
     AI moves it to `Ready` first — quoting the sentence it is acting on — so
     the board still records that a human approved the work, then moves it to
     `In Progress` before creating a branch or writing any code.
5. **Once the start has been authorised**, the AI proceeds autonomously.
   - Create the implementation branch and begin work without waiting for
     additional handholding unless the spec is unclear or blocked.
   - "From there" means from step 4's authorisation, never from step 2's
     confirmation. This sentence read as "do not wait" and was taken that way.
6. AI implements the feature autonomously within the bounds of the spec.
   - Use `skills/implement-feature.md` for the implementation, testing, and
     decision-record steps.
7. AI writes or updates the decision record while implementing.
   - The human should review it before final approval.
8. AI runs the relevant verification checks and prepares the change for review.
   - This includes tests, linting, type checking, and any relevant local
     validation.
9. AI opens a pull request.
   - Use `skills/open-pr.md` for the PR workflow.
   - Move the card to `In Review` once the pull request is open.
10. AI ticks the issue's checkboxes before handing the PR off.
   - Go through the issue's checklist sections — Acceptance criteria always,
     plus Scope where the template has it — and mark each box that is done. A box is ticked because the outcome was **verified**, not because
     the code was written — if a criterion says a page renders something, load
     it and look.
   - Where a criterion cannot be ticked honestly, say so on the issue rather
     than leaving it silently blank or ticking it anyway. A criterion that
     resists ticking usually means something was missed.
   - Easy to skip, because nothing fails when you do: #158 was implemented,
     verified, merged and closed with all eight boxes empty.
11. Human reviewers check the result and merge — **or tell the AI to merge**.
   - The AI supports the process, but humans own the review and merge decision
     in GitHub. The AI never merges on its own initiative, however green the
     checks are.

Important rules
- User-facing UI strings must be in Finnish.
- Code, comments, specs, and decision records should be in English.
- If required information is missing, stop and ask rather than guessing.
- The spec is the source of truth; implementation should not diverge from it
  without clear explanation in the decision record.
- Never begin implementation (branch creation, code, or tests) before the work
  is authorised — a human-set `Ready` card, or a human saying to start.
  Confirming scope in chat is neither of those. The AI never moves a card to
  `Ready` on its own initiative, and when instructed to, it quotes the
  instruction.
- Once the spec is confirmed and the card is `Ready`, the AI should continue
  through the workflow without requiring repeated human instruction for
  routine tasks such as branch creation, testing, and PR preparation.
