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
- Before handing off or merging any PR, tick the boxes on its issue — Scope
  and Acceptance criteria alike. A box is ticked because the outcome was
  **verified**, not because the code was written; if a criterion says a page
  renders something, load it and look. A criterion that cannot be ticked
  honestly gets said out loud on the issue rather than left blank or ticked
  anyway. This is skipped easily, because nothing fails when it is: #158 was
  implemented, verified, merged and closed with all eight boxes empty.
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

1. Write or update a feature spec in `specs/NNN-feature-name.md`.
2. Confirm the spec checklist in chat before implementation begins. The spec
   must cover scope, UX copy, API/data, edge cases, performance/limits,
   security, acceptance criteria, tests, and files to update.
3. Implement the feature only after the spec has been confirmed and any open
   questions are resolved.
4. Record implementation decisions in `decisions/NNN-feature-name.md` while
   building the feature.
5. Add or update tests, run them, and verify the implementation matches the
   spec and acceptance criteria.
6. Open a PR that references the spec and decision record, tick the issue's
   boxes, then leave it for human review; the code is considered published
   only after it is merged to main.

## Reference

- Setup and infrastructure docs: `docs/setup/` (numbered, authoritative,
  read in order — see `docs/setup/README.md`).
- Spec checklist: `skills/write-spec.md`.
- PR workflow: `skills/open-pr.md`.
- Chore workflow (no spec, no decision record): `skills/chore-workflow.md`.
- Bug workflow (no new spec; reference the existing one it violates;
  decision record only if the fix involved a real tradeoff):
  `skills/bug-workflow.md`.
- Review rules (also enforced by Sourcery): `REVIEW_RULES.md`.
