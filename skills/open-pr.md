# Skill: opening a pull request

When you have finished implementing a feature and tests are passing, open a pull
request using the following steps:

1. Create a feature branch named `feature/NNN-short-description` where NNN matches
   the issue and spec number.
2. Commit all changes with a conventional commit message, e.g.
   `feat: add standings form table (#NNN)`.
3. Check the diff size against the PR's base branch before pushing:
   `git diff <base-branch> | wc -c`. Sourcery skips review entirely — no
   findings, no automated check — on any PR over 150,000 diff characters.
   If you're over that, split the feature into smaller, stacked PRs
   (implement and merge one, then branch the next from it) rather than
   opening one oversized PR; see `decisions/006-other-competitions.md` for
   a worked example of this split. Aim comfortably under the limit
   (~120,000 characters), not right at the edge — Sourcery also enforces a
   separate weekly account-wide quota (500,000 diff characters as of
   2026-08), so even an under-the-limit PR can still get skipped if
   reviews earlier that week already used up the shared budget. There's no
   way to check remaining quota ahead of time; a `skipped` check-run with
   a rate-limit message is the only signal, and the fix is to wait, not to
   split further.
4. Push the branch and open a PR against main.
5. Fill in the PR template:
   - Reference the GitHub Issue number with a closing keyword — `Closes #NNN`
     (or `Fixes #NNN` / `Resolves #NNN`) — never a bare mention like
     `Refs #NNN` or `#NNN` on its own. GitHub only populates the PR↔issue
     link (the Development panel, and the project board's "Linked pull
     requests" field) when a closing keyword is present; anything else
     leaves the two disconnected even though the text still displays a
     cross-reference. The link is mandatory. That it also auto-closes the
     issue on merge is an accepted side effect, not a reason to avoid it —
     do not omit or reword the keyword to dodge it.
   - Link the spec file path
   - Link the decisions file path
   - Write a one or two sentence summary of what was built
   - List the steps a reviewer should take to verify the feature works
6. Do not merge the PR yourself. Leave it for human review.
7. If the PR merges without the issue auto-closing (for example the closing
   keyword was missing or malformed), close the issue manually and note in a
   comment which PR shipped it.