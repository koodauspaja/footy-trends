## Repository Review Rules (canonical)

Purpose: provide a single-file, human-readable source of truth for the project's
automated review rules. These rules are applied in the Sourcery dashboard and
documented here so reviewers and CI integrations have a stable reference.

Scope
- User-facing UI text: Finnish (labels, messages, copy visible to end users).
- Code, tests, specs, comments, commit messages, variable and function names: English.
- Configuration files and tooling settings: English unless they are end-user visible.

Caching and API usage
- Responses from every external data provider must be cached — football-data.org
  and TASO alike, and any provider added later. Implement caching with a
  sensible TTL (e.g. 5–15 minutes for frequently changing endpoints; longer for
  stable data). Tests and specs must state the expected cache policy — Block 5
  checks that half, and `specs/TEMPLATE.md` prompts for it.

Secrets and credentials
- Never commit API keys, secrets, or credentials. Use environment variables
  (e.g. `FOOTBALL_DATA_API_KEY`) and `.env.example` to document names.

Testing
- New features require tests in `tests/`. Tests must cover happy paths and the
  edge cases listed in the feature spec in `specs/`.

Specs and decision records
- A decision record in `decisions/` must faithfully interpret the spec it is
  named after; the two share a number. Drift between them is a finding — the
  spec saying "show last 5 matches" against a decision record saying "show
  last 3".
- Every PR must reference both documents in its description. This one is
  **not** a Sourcery rule and cannot become one: a review rule only sees
  changed lines, never the PR description. It is carried by the two checkboxes
  in `.github/PULL_REQUEST_TEMPLATE.md` and by `CLAUDE.md`. See
  `docs/setup/004-sourcery-setup.md` for why.

Accessibility and localization
- All visible UI must include localized Finnish strings and pass basic a11y
  checks (e.g., images and SVGs must have alt/title text).
- This section has **no Sourcery block, by design**, and both halves are
  already covered: Finnish strings by Block 2, and alt/title text by Biome's
  `a11y/useAltText` and `a11y/noSvgWithoutTitle` — both errors under
  `preset: recommended`, so both fail `npm run lint`. A Sourcery rule here
  would replace two deterministic checks with a guess at the same thing.

Tooling and overrides
- The following rules are enforced by the toolchain and need not be duplicated
  in Sourcery blocks: `noExplicitAny`, `noConsoleLog`, `a11y/useAltText`,
  `a11y/noSvgWithoutTitle` (see `docs/setup/012-project-init.md`).
- Prefer the toolchain wherever it can express the rule. Biome answers the same
  way every time; a review rule is asked in prose and answers by judgement, so
  it belongs where no deterministic check can reach — see the false findings
  described in `docs/setup/004-sourcery-setup.md`.

How this maps to Sourcery
- Create Sourcery dashboard blocks that mirror the sections above. Example
  mapping used in `docs/setup/004-sourcery-setup.md`:

  Block 1 (paths: `specs/**,decisions/**`): spec-to-decision-record drift
  Block 2 (paths: `src/**/*.ts,src/**/*.tsx`): UI localization, code language, caching
  Block 3 (paths: `src/**/*.ts,src/**/*.tsx,tests/**/*.ts,tests/**/*.tsx,specs/**`): testing requirements
  Block 4 (paths: `**`): secrets and credentials
  Block 5 (paths: `tests/**/*.ts,tests/**/*.tsx,specs/**`): stated cache policy

- A block's paths must cover every file its rules ask about, not only the files
  whose changes should be flagged. All four blocks were audited against that in
  #386 and three of them failed it: Block 1 compared two documents from behind
  `src/**`, Block 3 asked about spec-defined edge cases with `specs/` out of
  scope and missed all 53 `.tsx` test files because `tests/**/*.ts` does not
  match `.tsx`, and the secrets rule said "committed files" while seeing only
  TypeScript. A rule scoped away from its own subject matter does not fall
  silent — it guesses.

Authority
- The Sourcery dashboard rules are the authoritative automated checks. This
  file documents the intended policy and should be updated when adding or
  changing rules in the dashboard.

Updating
- To change a rule: update the Sourcery dashboard, then update this file in
  the same commit and include a brief justification in the commit message.

Contact
- For questions about rule interpretation, ping the repository owners.
