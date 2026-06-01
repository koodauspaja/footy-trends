# 004 — Sourcery setup

## Goal
Install Sourcery on the repository, configure it to review in Finnish, point it
at the project-specific rules, and verify it works with a dummy PR.

---

## Step 1 — Install Sourcery

1. Go to https://sourcery.ai
2. Sign in with GitHub
3. Click **Add a repository** and select `footy-trends`
4. Sourcery will install itself as a GitHub App on the repo

---

## Step 2 — Configure language to Finnish

In the Sourcery dashboard (https://app.sourcery.ai):

1. Go to **Review Settings**
2. Under **Language**, select **Finnish**
3. Save

---

## Step 3 — Create `.sourcery.yaml`

Create file: `.sourcery.yaml` in the repo root.

```yaml
rule_settings:
  enable:
    - default

reviews:
  # Review in Finnish
  # (also set in dashboard — belt and braces)
  profile: default

  review_level: balanced

  # Disable sections we don't need
  enable_tips_comments: false

  # Path-specific rules — only review source code, not specs or decisions
  paths:
    - src/**
    - tests/**
```

---

## Step 4 — Create `REVIEW_RULES.md`

This is the file Sourcery reads to understand project-specific expectations.
Write it in English — Sourcery translates its output to Finnish automatically.

Create file: `REVIEW_RULES.md` in the repo root.

```markdown
# Review rules for footy-trends

These rules apply to every pull request. Sourcery should check for all of them
and flag violations as review comments in Finnish.

## Spec and decision integrity
- Every PR must reference a spec file in `specs/` via the PR template.
- Every PR must reference a decision record in `decisions/` via the PR template.
- The decision record must faithfully interpret the spec. Flag any drift between
  the two — for example, if the spec says "show last 5 matches" but the decisions
  doc says "show last 3 matches".
- If the spec defines explicit edge cases, check that the code handles them.

## Finnish UI
- All user-facing strings must be in Finnish.
- Variable names, function names, comments, and code must remain in English.

## Testing
- Every new feature must have corresponding tests in `tests/`.
- Tests should cover the happy path and the edge cases defined in the spec.

## Data and API
- API responses from football-data.org must be cached. Never call the API
  on every page load or render.
- No API keys or secrets may appear in code or committed files.
  All secrets must come from environment variables.

## General
- No `console.log` left in production code.
- TypeScript strict mode — no use of `any`. This is enforced by Biome at the
  tooling level (`noExplicitAny: error`). If `any` appears in a PR it is a
  Biome violation, not just a style note.
```

---

## Step 5 — Commit config files

```bash
git add .sourcery.yaml REVIEW_RULES.md
git commit -m "chore: add Sourcery config and review rules"
git push origin main
```

---

## Step 6 — Test with a dummy PR

Create a throwaway branch with a small intentional issue to confirm Sourcery
fires and comments in Finnish:

```bash
git checkout -b test/sourcery-check
echo "// test file" > src/test-sourcery.ts
git add src/test-sourcery.ts
git commit -m "test: dummy file to trigger Sourcery review"
git push origin test/sourcery-check
```

Open a PR from this branch to main on GitHub. Within a few minutes Sourcery
should add a review comment. Confirm:

- [ ] Comment appears on the PR
- [ ] Comment is in Finnish
- [ ] PR template loaded correctly

Delete the branch and close the PR without merging once confirmed.

---

## Done when
- [ ] Sourcery installed on repo
- [ ] Language set to Finnish in dashboard
- [ ] `.sourcery.yaml` and `REVIEW_RULES.md` committed
- [ ] Dummy PR confirmed Sourcery fires in Finnish

## Next
→ `005-railway-setup.md`