# Project instructions

## Hard rules

- Do not begin implementation until the spec checklist in
  `skills/write-spec.md` has been confirmed in chat for the feature being
  built. A missing item — especially Edge Cases, Caching, or Acceptance
  Criteria — means stop and ask, not fill in a reasonable-sounding default.
  A guessed edge case is worse than no edge case, because it looks
  intentional in review.
- Every PR must reference its spec (`specs/NNN-feature-name.md`) and write a
  decision record (`decisions/NNN-feature-name.md`), per `skills/open-pr.md`.
- Before handing off or merging any PR, tick every checkbox its issue has —
  Acceptance criteria always, plus Scope where the template provides it. A box
  is ticked because the outcome was **verified**, not because the code was
  written; if a criterion says a page renders something, load it and look. A
  criterion that cannot be ticked honestly gets said out loud on the issue
  rather than left blank or ticked anyway. This is skipped easily, because
  nothing fails when it is: #158 was implemented, verified, merged and closed
  with all eight boxes empty.
- **Claude never moves a card to `Ready`, and never merges a pull request, on
  its own initiative.** Either is fine when a human instructs it, in whatever
  words they like — no particular phrasing is required, and "in those words" is
  not the test. The test is whether a sentence the human actually wrote
  instructs it. Claude's own inference, however reasonable, is not
  authorisation, and neither is being confident or being green. When Claude sets
  `Ready` itself it quotes the sentence it is acting on, so the evidence is
  visible rather than in its head.
- All user-facing UI strings are Finnish. All code, comments, specs, and
  decision records are English. No exceptions in either direction.
- Every GitHub issue must have both its label and its Issue Type field set,
  matched to the issue kind: `enhancement` label → `Feature` type, `chore`
  label → `Task` type, `bug` label → `Bug` type. The `gh` CLI has no
  `--type` flag for `issue create`/`issue edit`; set it via
  `gh api repos/:owner/:repo/issues/NUMBER -X PATCH -f type="Feature"` (or
  `Task`/`Bug`) right after creating or editing the issue — `:owner`/`:repo`
  are resolved by `gh` itself from the current repository.
- Every GitHub issue — feature, bug, or chore alike — must be added to the
  `Footy Trends` Project board (status `Backlog`) immediately after
  creation. The repo has no GitHub-native "auto-add to project" workflow
  configured, so this is a manual step every time, not something that
  happens on its own. See `docs/setup/002-github-project-board.md` for the
  exact command and board IDs.

## Required workflow

1. Write or update the spec in `specs/NNN-feature-name.md`, following
   `skills/write-spec.md`. **A human initiates the spec and is responsible for
   the outcome**; how much of the drafting Claude does varies by feature, which
   is why this step is "we write it" rather than either name alone.

2. **Confirm the spec in chat.** Every open question is answered, and the human
   says **go**.

   Claude never declares this itself. Engagement is not agreement: "what's
   next?", "do you have what you need?", "splitting it is fine", and silence are
   all *not* a go. Writing "treating the checklist as confirmed" is Claude
   inventing the checkpoint rather than passing it.

3. **After the go, update the GitHub issue** so it carries the spec's scope and
   acceptance criteria, per `skills/open-issue.md`. This is how the spec reaches
   the people who approve it — they read the issue, not the chat, and not files
   on Claude's machine.

4. **Never start without having asked whether the issue is good and been
   answered.** A human-set `Ready` card *is* an answer — putting it there is the
   human saying they read the issue and approved it. In every other situation,
   ask, and wait.

   The human decides whether to read it, then authorises the start. **Either of
   these alone is enough:** they move the card to `Ready` themselves — the
   column means "ready for Claude Code", so its presence is the authorisation —
   or they say so, in **any wording**. All of these are a start:

   - "looks good, update issue and start work"
   - "yes, looks good, you can go ahead with the implementation"
   - "issue in ready now"

   Until something like that arrives: no branch, no code, no migration, no board
   change.

   **When Claude sets `Ready` itself, it must quote the sentence it is acting
   on, in the same message.** Not as a password — as evidence. The quote has to
   read, plainly, as an instruction to start. These are *not* one, and Claude has
   treated each of them as one:

   - "#119 next, right? you got all you need?" — a question about order
   - "if you see value splitting this feature, it's ok too" — permission to
     reshape the work, not to begin it
   - silence, or Claude's own summary saying the checklist is confirmed

   If there is nothing quotable that tells Claude to start, the answer is to ask
   — which is this step.

5. **The card passes through `Ready` either way**, then `In Progress`, before a
   branch exists. If the human moved it to `Ready`, nothing to do. If they
   authorised the start without moving it, Claude moves it there first, quoting
   the sentence it is acting on — so the board records that a human approved the
   work rather than showing it appearing in `In Progress` from nowhere.

6. Implement autonomously within the spec: decision record in
   `decisions/NNN-feature-name.md`, tests, the pass in `skills/self-review.md`,
   then a PR per `skills/open-pr.md`, tick the issue's boxes, and move the card
   to `In Review`. The target is **zero** Sourcery and Sonar findings — findings
   answered after the fact are not the same thing.

7. The human checks the result and merges, **or tells Claude to merge**. However
   green it is.

Steps 2, 4 and 7 are the three points where a human decides. Everything Claude
does sits between them, never across one.

## Reference

- Setup and infrastructure docs: `docs/setup/` (numbered, authoritative,
  read in order — see `docs/setup/README.md`).
- Spec checklist: `skills/write-spec.md`.
- PR workflow: `skills/open-pr.md`.
- Chore workflow (no spec, no decision record): `skills/chore-workflow.md`.
- The pass to run **before** requesting a review: `skills/self-review.md` —
  seven defect classes measured from this repository's own review history, with
  the counter to each. `npm run review:findings` re-measures them.
- Release workflow (promoting `main` to `release`): `skills/release.md`.
- Bug workflow (no new spec; reference the existing one it violates;
  decision record only if the fix involved a real tradeoff):
  `skills/bug-workflow.md`.
- Review rules (also enforced by Sourcery): `REVIEW_RULES.md`.
