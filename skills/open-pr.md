# Skill: opening a pull request

When you have finished implementing a feature and tests are passing, open a pull
request using the following steps:

1. Create a feature branch named `feature/NNN-short-description` where NNN matches
   the issue and spec number.
2. Commit all changes with a conventional commit message, e.g.
   `feat: add standings form table (#NNN)`.
3. Push the branch and open a PR against main.
4. Fill in the PR template:
   - Link the GitHub Issue number
   - Link the spec file path
   - Link the decisions file path
   - Write a one or two sentence summary of what was built
   - List the steps a reviewer should take to verify the feature works
5. Do not merge the PR yourself. Leave it for human review.