# 524 — Setup documents for two readers: decisions

Chore #524 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `tests/unit/docs/setup-chain.test.ts` at `e4b182f` by #531.

- **Why the chain has a test.** The chain ended at 022, four documents
  could not be reached by following it, and one pointed back at a feature
  spec. Nothing failed, so nobody noticed.
