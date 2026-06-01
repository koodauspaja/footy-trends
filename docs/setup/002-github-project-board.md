# 002 — GitHub Project board and issue templates

## Goal
Set up a GitHub Project board for tracking features and create issue templates
so every feature starts with a consistent structure.

---

## Step 1 — Create the GitHub Project

1. Go to https://github.com/orgs/koodauspaja/projects
2. Click **New project**
3. Choose **Board** view
4. Name it: `Footy Trends`
5. Link it to your repository:
   - Inside the project → Settings → Linked repositories → add `footy-trends`

### Recommended columns
Rename the default columns to:

| Column | Purpose |
|--------|---------|
| `Backlog` | Ideas and future features |
| `Ready` | Spec written and validated — ready for Claude Code |
| `In progress` | Claude Code is working on it |
| `In review` | PR open, Sourcery reviewing |
| `Done` | Merged to main, deployed |

---

## Step 2 — Create issue templates

Create the following files in `.github/ISSUE_TEMPLATE/`:

### Feature template
File: `.github/ISSUE_TEMPLATE/feature.md`

```markdown
---
name: Feature
about: A new feature or user-facing change
title: "[FEATURE] "
labels: feature
assignees: ''
---

## Summary
<!-- One sentence: what does this feature do for the user? -->

## Spec file
<!-- Link to the spec file once created, e.g. specs/001-standings-form-table.md -->
`specs/NNN-feature-name.md`

## Acceptance criteria
<!-- How do we know this is done? -->
- [ ]
- [ ]
- [ ]

## Out of scope
<!-- What are we explicitly NOT doing in this feature? -->
-

## Notes
<!-- Anything else relevant — API limits, Finnish UI copy, edge cases -->
```

### Bug template
File: `.github/ISSUE_TEMPLATE/bug.md`

```markdown
---
name: Bug
about: Something is not working as the spec describes
title: "[BUG] "
labels: bug
assignees: ''
---

## What happened
<!-- Describe the problem -->

## What should happen
<!-- Reference the relevant spec if applicable -->
Spec: `specs/NNN-feature-name.md`

## Steps to reproduce
1.
2.
3.

## Notes
```

---

## Step 3 — Commit the templates

```bash
git add .github/ISSUE_TEMPLATE/
git commit -m "chore: add issue templates"
git push origin main
```

---

## Step 4 — Test it

1. Go to your repo → Issues → New issue
2. Confirm both templates appear as options
3. Create one test feature issue using the feature template
4. Add it to the Project board and move it to `Backlog`

---

## Done when
- [ ] GitHub Project board exists with correct columns
- [ ] Feature and bug issue templates work
- [ ] Test issue created and visible on the board

## Next
→ `003-pr-template.md`