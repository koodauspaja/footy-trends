# Skill: implementing a feature

When handed a spec (via a GitHub Issue in the `Ready` column, or a direct
spec path), follow this process to implement it.

## 1. Read before writing
- Read the spec file in full (`specs/NNN-feature-name.md`).
- Read `REVIEW_RULES.md` — every rule there applies to this PR.
- Check `docs/setup/` for any relevant infrastructure context (e.g. caching
  utility in `src/lib/cache.ts`, DB client in `src/db/`).

## 2. Branch
Create a feature branch named `feature/NNN-short-description`, matching the
spec number.

## 3. Implement
- Follow the spec's acceptance criteria exactly. If something is ambiguous
  or underspecified, make the most reasonable choice, implement it, and
  document the choice and reasoning in the decision record (step 5) rather
  than guessing silently.
- All user-facing strings in Finnish. Code, comments, identifiers in English.
- Cache API responses per the spec's caching policy — never call
  football-data.org on every render.
- No `any` without a comment explaining why. No `console.log`.

## 4. Test
- Write tests in `tests/` covering the happy path and the edge cases listed
  in the spec.
- Run `npm run typecheck`, `npm run lint`, and `npm test` locally. All three
  must pass before opening a PR.

## 5. Write the decision record
Create `decisions/NNN-feature-name.md` describing:
- What was actually built
- Any point where the implementation diverged from the spec, and why
- Any ambiguity in the spec that was resolved by judgement call

This file is what reviewers and Sourcery check against the spec for drift —
be precise, especially on numbers and edge cases (e.g. "form shows the last
5 matches; teams with fewer than 5 played show all available results").

## 6. Open the PR
Follow `skills/open-pr.md`. Do not merge — leave for human review.

## Notes
- If the spec is missing something the checklist in `skills/write-spec.md`
  requires, stop and flag it rather than filling the gap silently — this
  goes back to spec
  