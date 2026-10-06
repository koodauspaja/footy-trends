# 278 — Unit tests do not print application logs: decisions

Chore #278 had no record of its own; #574 created this one for a reason cut from
a comment of its code.

## Moved from comments, 2026-10-06

Cut from `src/lib/logger.ts` at `60bb68e` by #574.

- **`defaultLevel`.** Application logs are not test output. A page test that
  renders a competition page reaches `getViewerPreferences`, whose `headers()`
  call throws outside a request scope, the graceful degradation working as
  designed, and every such test printed a full stack trace, burying the
  results. `LOG_LEVEL` still wins, so `LOG_LEVEL=debug npm run test:unit`
  brings the logs back when a test is being debugged. The Axiom transport is
  already disabled for tests; this is the stdout half of the same decision.
