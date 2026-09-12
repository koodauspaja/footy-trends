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

| Column | Purpose | Who moves a card into it |
|--------|---------|--------------------------|
| `Backlog` | Ideas and future features | Whoever files the issue |
| `Ready` | Issue written and validated — ready for Claude Code | **A human.** Claude may do it only when told to, and must quote the instruction it is acting on |
| `In Progress` | Claude Code is working on it | Claude, once the start is authorised |
| `In Review` | PR open, Sourcery reviewing | Claude, when the PR opens |
| `Done` | Merged to main, deployed | The board's built-in `Pull request merged` workflow |

**"Issue", not "spec".** Chores and bugs have no feature spec —
`skills/chore-workflow.md` and `skills/bug-workflow.md` say so outright — and
they use this column like everything else. Defining `Ready` in terms of a spec
made valid chore and bug cards look as though they were missing a document that
does not exist for them.

**The capitalisation is part of the name.** GitHub matches a status by its
exact name, so a board built with `In progress` will not be found by tooling
looking for `In Progress` — and `scripts/release-pr.ts` reads the options by
name. These are the names the live board uses.

`Ready` is the gate the whole workflow turns on: it is the point where a human
has read the issue and agreed the work should begin. Claude reaching it on its
own reasoning defeats the only checkpoint before code gets written — which has
happened, and is why the quote is required. `CLAUDE.md`'s Required workflow is
the authority; this table is here so the columns and the rule live in the same
place.

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

## Step 5 — Add every new issue to the board manually

This project has **no GitHub-native "auto-add to project" workflow**
configured — confirmed via `gh api graphql` against the project's
`workflows` field, which only lists the fixed built-ins (`Item added to
project`, `Item closed`, `Pull request merged`, `Pull request linked to
issue`, `Auto-close issue`, `Auto-add sub-issues to project`) and no
filter-based auto-add rule. A newly created issue does **not** appear on
the board on its own, regardless of its type (feature, bug, or chore) or
label.

Every issue must be added right after creation, as its own step — not
deferred until implementation work on it begins:

```bash
gh project item-add 2 --owner koodauspaja --url <issue-url>
```

That adds the item with no status set, which the board view treats as
outside every column. Set it to `Backlog` explicitly:

```bash
gh project item-list 2 --owner koodauspaja --format json \
  | jq -r '.items[] | select(.content.number == <ISSUE_NUMBER>) | .id'
```

then, with that item ID:

```bash
gh project item-edit \
  --id <ITEM_ID> \
  --project-id PVT_kwDOB7brSc4BZbi_ \
  --field-id PVTSSF_lADOB7brSc4BZbi_zhUaPJM \
  --single-select-option-id f75ad846
```

(`PVT_kwDOB7brSc4BZbi_` is this project's ID, `PVTSSF_lADOB7brSc4BZbi_zhUaPJM`
the Status field ID, and `f75ad846` the `Backlog` option ID — re-verify
with `gh project field-list 2 --owner koodauspaja` if any of these ever
stop working, since the board could be restructured.)

An alternative to configuring this by hand every time is enabling a real
"auto-add to project" workflow from the project's own Workflows settings
in the GitHub UI (Project → ⋯ → Workflows → Auto-add to project → filter
`is:issue`), which would make this step unnecessary going forward. Not
yet done as of this writing — until it is, treat the manual add as
mandatory.

---

## Step 6 — Label an issue with the part of the app it touches

Every issue carries **two kinds of label**, and they answer different
questions.

**What kind of work it is**, which the templates set for you and which pairs
with the Issue Type field — `enhancement` → Feature, `chore` → Task, `bug` →
Bug. CLAUDE.md makes that pairing a hard rule.

**Which part of the app it touches**, which is added by hand:

| label | what it covers |
|---|---|
| `auth` | Sign-in, accounts, sessions, and what they gate |
| `taso` | Palloliitto's TASO provider and Finnish football |
| `football-data` | The football-data.org provider and its competitions |
| `standings` | League tables, positions and rounds |
| `matches` | Match lists, match pages and head-to-head |
| `teams` | Team pages, team search, and how a team is identified |
| `ui` | Navigation, copy, theming and page chrome |
| `analytics` | Trends, charts, predictions and their calibration |
| `testing` | Test suites, fixtures, coverage and flakes |
| `ci` | Workflows, review gates, release tooling and dependencies |
| `infra` | Deployment, production environment, logging and datastores |

`analytics` has three sub-labels for the shape of the work rather than its
subject — `charts`, `predictions`, `calibration`.

An issue may carry several. Most bugs and chores belong to the same domain as
the spec they came from, which is the quickest way to pick one: a TASO
rendering bug is `taso`, a flake in its test is `testing`.

**These are not decoration.** `skills/release.md` reads them off the issues a
release contains and both names them in the release notes and applies them to
the release pull request, so an unlabelled issue makes a release describe
itself less accurately.

Adding a label that does not exist **creates it**, silently — verified against
a real pull request, where a deliberately misspelled name appeared in the
repository's label list rather than being rejected. So spell them from this
table, and if a genuinely new domain is needed, create it deliberately with a
description rather than by typo:

```bash
gh label create <name> --description "<what it covers>" --color RRGGBB
```

## Step 7 — The release pull request goes on the board too

`npm run release:pr` adds it and sets it to `In Progress` — opening the pull
request is the work starting. It reaches `Done` on its own: the project's
built-in **`Pull request merged`** workflow is enabled, so merging the release
moves the card without anybody remembering to.

`In Review` in between is a human step, and stays one deliberately. GitHub
publishes no built-in workflow for "review requested", and `GITHUB_TOKEN` is
scoped to the repository and [cannot access Projects at
all](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions),
so an Actions job would need a classic PAT with `project` and `repo`, or a
GitHub App with organization-project write, kept as a repository secret.
Requesting the review is already a human action; a long-lived credential in the
repository is the larger cost. Worth revisiting if that token is ever needed
for something else.

`Backlog` and `Ready` are skipped: they describe work being planned, and a
release pull request is created already complete.

**Read the status option ids rather than remembering them.** They are not
listed anywhere in this document on purpose — a wrong one fails with `The
single select option Id does not belong to the field`, and a command whose
stderr is hidden leaves the card where it was while appearing to succeed. The
command that prints them:

```bash
gh project field-list 2 --owner koodauspaja --format json |
  jq '.fields[] | select(.name == "Status") | .options'
```

## Done when
- [ ] GitHub Project board exists with correct columns
- [ ] Feature and bug issue templates work
- [ ] Test issue created and visible on the board
- [ ] Every issue type (feature, bug, chore) is confirmed to land on the
      board in `Backlog` immediately after creation, not just at
      implementation time

## Next
→ `003-pr-template.md`