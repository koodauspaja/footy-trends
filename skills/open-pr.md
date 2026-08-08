# Skill: opening a pull request

When you have finished implementing a feature and tests are passing, open a pull
request using the following steps:

1. Create a feature branch named `feature/NNN-short-description` where NNN matches
   the issue and spec number.
2. Commit all changes with a conventional commit message, e.g.
   `feat: add standings form table (#NNN)`.
3. Push the branch and open a PR against main.
4. Fill in the PR template:
   - Reference the GitHub Issue number without an auto-closing keyword (e.g.
     `Refs #NNN`, not `Closes #NNN`) — the issue is moved to done manually
     after the PR's results are checked, not automatically on merge.
   - Link the spec file path
   - Link the decisions file path
   - Write a one or two sentence summary of what was built
   - List the steps a reviewer should take to verify the feature works
5. Do not merge the PR yourself. Leave it for human review.
6. After the PR is merged and its results are checked, move the linked issue
   to done manually.