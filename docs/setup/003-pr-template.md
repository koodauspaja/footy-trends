# 003 — Pull request template

## Goal
Add a PR template that links every pull request to its GitHub Issue, spec file,
and decisions file. Claude Code should fill most of this in automatically.

---

## Step 1 — Create the PR template

Create file: `.github/PULL_REQUEST_TEMPLATE.md`

```markdown
## Linked issue
Closes #<!-- issue number -->

## Spec
`specs/<!-- NNN-feature-name.md -->`

## Decision record
`decisions/<!-- NNN-feature-name.md -->`

## Summary
<!-- What was built? One or two sentences. Written by the coding agent. -->

## How to verify
<!-- What should a reviewer check? Written by the coding agent. -->
- [ ]
- [ ]

## Checklist
- [ ] Spec file exists and is linked above
- [ ] Decision record exists and is linked above
- [ ] Tests written and passing
- [ ] UI strings are in Finnish
- [ ] No API keys or secrets committed
- [ ] No console.log left in code
```

---

## Step 2 — Commit the template

```bash
git add .github/PULL_REQUEST_TEMPLATE.md
git commit -m "chore: add PR template"
git push origin main
```

---

## Step 3 — Instruct Claude Code to use it

Add this to your `skills/` folder as a reusable instruction for Claude Code.

Create file: `skills/open-pr.md`

```markdown
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
```

```bash
git add skills/open-pr.md docs/setup/003-pr-template.md
git commit -m "chore: add open-pr skill and update setup instructions"
git push origin main
```

---

## Done when
- [ ] PR template appears automatically when opening a new PR
- [ ] `skills/open-pr.md` committed to repo

## Next
→ `004-sourcery-setup.md`