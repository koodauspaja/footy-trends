## Repository Review Rules (canonical)

Purpose: provide a single-file, human-readable source of truth for the project's
automated review rules. These rules are applied in the Sourcery dashboard and
documented here so reviewers and CI integrations have a stable reference.

Scope
- User-facing UI text: Finnish (labels, messages, copy visible to end users).
- Code, tests, specs, comments, commit messages, variable and function names: English.
- Configuration files and tooling settings: English unless they are end-user visible.

Caching and API usage
- All responses from football-data.org must be cached. Implement caching with a
  sensible TTL (e.g. 5–15 minutes for frequently changing endpoints; longer for
  stable data). Tests and specs must state the expected cache policy.

Secrets and credentials
- Never commit API keys, secrets, or credentials. Use environment variables
  (e.g. `FOOTBALL_DATA_API_KEY`) and `.env.example` to document names.

Testing
- New features require tests in `tests/`. Tests must cover happy paths and the
  edge cases listed in the feature spec in `specs/`.

Accessibility and localization
- All visible UI must include localized Finnish strings and pass basic a11y
  checks (e.g., images and SVGs must have alt/title text).

Tooling and overrides
- The following rules are enforced by the toolchain and need not be duplicated
  in Sourcery blocks: `noExplicitAny`, `noConsoleLog` (see `docs/setup/012-project-init.md`).

How this maps to Sourcery
- Create Sourcery dashboard blocks that mirror the sections above. Example
  mapping used in `docs/setup/004-sourcery-setup.md`:

  Block 1 (paths: `src/**/*.ts,src/**/*.tsx,tests/**/*.ts`): PR template requirements
  Block 2 (paths: `src/**/*.ts,src/**/*.tsx`): UI localization and code language rules
  Block 3 (paths: `src/**/*.ts,src/**/*.tsx,tests/**/*.ts`): testing requirements

Authority
- The Sourcery dashboard rules are the authoritative automated checks. This
  file documents the intended policy and should be updated when adding or
  changing rules in the dashboard.

Updating
- To change a rule: update the Sourcery dashboard, then update this file in
  the same commit and include a brief justification in the commit message.

Contact
- For questions about rule interpretation, ping the repository owners.
