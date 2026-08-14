# Skill: opening a GitHub issue from a spec

Purpose
Use this skill when a feature spec is complete and ready for implementation
tracking. It explains how to turn a finished spec file into a GitHub Issue with
`gh`, using the Feature template in `.github/ISSUE_TEMPLATE/feature.md`.

When to use
- After a spec file is finished and reviewed.
- Before implementation starts, so the work has a tracked issue.
- When the spec follows the structure in `specs/TEMPLATE.md`.

Input
- A spec file path such as `specs/001-standings-form-table.md`.

Required behavior
- Read the spec title from the first `#` heading.
- Extract the `## Summary` section to populate the issue summary.
- Extract the `## Acceptance Criteria` checklist to populate the issue
  acceptance criteria section.
- Fill in the `Spec file` field with the correct relative path.
- Use the `feature` label.
- Do not assign the issue to anyone.
- Print the created issue number and URL when done.

Procedure
1. Confirm the spec file exists and is written in the repo template format.
2. Read the spec title from the first heading, for example:
   `# 001 — Standings form table`
3. Read the summary text from the `## Summary` section.
4. Read each checklist item from the `## Acceptance Criteria` section.
5. Create a temporary issue body using the Feature template structure:
   - `## Summary`: the extracted summary text
   - `## Spec file`: the spec path
   - `## Acceptance criteria`: the checklist items
   - `## Out of scope`: leave blank unless the spec already has a useful note
   - `## Notes`: optional, if helpful
6. Create the issue with `gh issue create`:
   - use the `enhancement` label
   - do not pass any assignee option
7. Set the Issue Type field to `Feature` — `gh issue create` has no
   `--type` flag, so this needs a follow-up REST call:
   `gh api repos/OWNER/REPO/issues/NUMBER -X PATCH -f type="Feature"`.
8. Print the created issue number and URL.

Example workflow

```bash
spec_file="$1"

if [ -z "$spec_file" ]; then
  echo "Usage: gh_issue_from_spec.sh <spec-file>" >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
spec_path="$repo_root/$spec_file"

if [ ! -f "$spec_path" ]; then
  echo "Spec file not found: $spec_file" >&2
  exit 1
fi

# Extract title from the first level-1 heading
spec_title="$(awk '/^# /{sub(/^# /, ""); print; exit}' "$spec_path")"

# Extract the Summary section
summary="$(awk '
  /^## Summary$/ {flag=1; next}
  /^## / && flag {exit}
  flag {print}
' "$spec_path" | sed '/^$/d')"

# Extract the Acceptance Criteria checklist items
acceptance="$(awk '
  /^## Acceptance Criteria$/ {flag=1; next}
  /^## / && flag {exit}
  flag {print}
' "$spec_path" | sed '/^$/d')"

tmp_body="$(mktemp)"
cat > "$tmp_body" <<EOF
## Summary
$summary

## Spec file
$spec_file

## Acceptance criteria
$acceptance

## Out of scope
-

## Notes
EOF

issue_url="$(gh issue create \
  --title "[FEATURE] $spec_title" \
  --label enhancement \
  --body-file "$tmp_body")"

rm -f "$tmp_body"

# gh issue create has no --json/--type flag, so the number is parsed from
# the printed URL. :owner/:repo below are resolved by gh itself from the
# current repository — no hard-coded placeholder to fill in.
issue_number="$(basename "$issue_url")"
gh api "repos/:owner/:repo/issues/$issue_number" -X PATCH -f type="Feature"
```

Notes
- The generated issue title should be prefixed with `[FEATURE]` to match the
  repository issue template.
- If the spec uses a numbered filename like `specs/001-feature-name.md`, the
  issue title should still be based on the content of the spec, not the number
  alone.
- This skill is intentionally lightweight; keep the issue text concise and
  derived directly from the completed spec.
