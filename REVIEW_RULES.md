## Repository Review Rules (canonical)

Purpose: provide a single-file, human-readable source of truth for the project's
automated review rules. These rules are applied in the Sourcery dashboard and
documented here so reviewers and CI integrations have a stable reference.

Scope
- User-facing UI text: Finnish (labels, messages, copy visible to end users).
- Code, tests, specs, comments, variable and function names: English. Block 6
  checks it in every file a pull request changes, which is as far as any rule
  reaches. Finnish UI copy — in source, or asserted in a test
  or quoted in a spec — is data, not a language violation. `CLAUDE.md` carries
  the same carve-out, so the two do not disagree.
- Commit messages: English too, but unchecked — see below.
- Configuration files and tooling settings: English unless they are end-user
  visible (Block 6 covers these too).

Caching and API usage
- Responses from every external **application data** provider must be cached —
  football-data.org and TASO alike, and any application data provider added
  later. Implement caching with a sensible TTL (e.g. 5–15 minutes for
  frequently changing endpoints; longer for stable data). Tests and specs must
  state the expected cache policy (Block 5).
- Tooling under `scripts/` is not covered: its GitHub API calls
  (`release-version.ts`, `review-findings.ts`) run once from a terminal or CI,
  where a cache would serve a stale answer rather than save a request.

Secrets and credentials
- Never commit API keys, secrets, or credentials. Use environment variables
  (e.g. `FOOTBALL_DATA_API_KEY`) and `.env.example` to document names.
- Block 4 asks only about secrets the pull request introduces or modifies — a
  rule sees changed lines, so it cannot vouch for files nobody touched. There
  is no repo-wide secret scanner here; that gap is real and unclaimed.

Testing
- New features require tests in `tests/`. Tests must cover happy paths and the
  edge cases listed in the feature spec in `specs/`.

Specs and decision records
- A decision record in `decisions/` must faithfully interpret the spec it is
  named after; the two share a number. Drift between them is a finding — the
  spec saying "show last 5 matches" against a decision record saying "show
  last 3".
- Every PR must reference both documents in its description (not a Sourcery
  rule — see below).
- Block 1 compares the two when a pull request changes them together, which a
  feature PR does: it adds both. Whether Sourcery reads the unchanged
  counterpart on a **one-sided edit** is not established — its documentation
  says a rule looks at changed lines. Treat that case as unchecked until
  someone measures it.

Accessibility and localization
- All visible UI must include localized Finnish strings and pass basic a11y
  checks (e.g., images and SVGs must have alt/title text).

Tooling and overrides
- The following rules are enforced by the toolchain and need not be duplicated
  in Sourcery blocks: `noExplicitAny`, `noConsoleLog`, `a11y/useAltText`,
  `a11y/noSvgWithoutTitle` (see `docs/setup/012-project-init.md`).
- Prefer the toolchain wherever it can express the rule. A review rule answers
  by judgement; save it for what no deterministic check can reach.

How this maps to Sourcery
- Create Sourcery dashboard blocks that mirror the sections above. Example
  mapping used in `docs/setup/004-sourcery-setup.md`:

  Block 1 (paths: `specs/**,decisions/**`): spec-to-decision-record drift
  Block 2 (paths: `src/**/*.ts,src/**/*.tsx`): Finnish UI strings, caching
  Block 3 (paths: `src/**/*.ts,src/**/*.tsx,tests/**/*.ts,tests/**/*.tsx,specs/**`): testing requirements
  Block 4 (paths: `**`): secrets and credentials
  Block 5 (paths: `tests/**/*.ts,tests/**/*.tsx,specs/**`): stated cache policy
  Block 6 (paths: `**`): English in every changed file

- A block's paths must cover every file its rules ask about, not only the files
  whose changes should be flagged. Each line below is a mistake #386 corrected:

  | Block | Path detail | Without it |
  |---|---|---|
  | 1 | `specs/**` *and* `decisions/**` | compares two documents it was not shown |
  | 2 | names both providers | TASO uses the same `getCached` helper, unchecked |
  | 3 | `tests/**/*.tsx` | all 53 component tests invisible — `*.ts` misses `.tsx` |
  | 3 | `specs/**` | "edge cases defined in the spec" asks about a file out of scope |
  | 4 | `**`, not `src/**` | a secret arrives in a workflow or `.toml` more often than a `.tsx` |
  | 5 | its own block | widening Block 2 would aim its Finnish-strings rule at spec markdown |
  | 6 | `**`, not a directory list | `docs/`, `skills/`, `scripts/`, `.github/` fall through any list |
  | 6 | carve-out for quoted copy | 67 tests and 24 specs hold Finnish UI copy on purpose |

Deliberately not Sourcery rules
- **Spec and decision-record references in the PR description** — impossible,
  not merely unwritten: a rule never sees the description. Carried by
  `CLAUDE.md` and the PR template's checkboxes.
- **Accessibility** — Finnish UI strings are Block 2, alt/title text is Biome's
  `a11y/useAltText` and `a11y/noSvgWithoutTitle`. Both already deterministic.
- **`noExplicitAny`, `noConsoleLog`** — Biome, as above.
- **Commit messages in English** — a rule reads files, never the commit log,
  and there is no `commit-msg` hook or commitlint here. Convention only, and
  named as such rather than left looking enforced.

Authority
- The Sourcery dashboard rules are the authoritative automated checks. This
  file documents the intended policy and should be updated when adding or
  changing rules in the dashboard.

Updating
- To change a rule: update the Sourcery dashboard, then update this file in
  the same commit and include a brief justification in the commit message.

Contact
- For questions about rule interpretation, ping the repository owners.
