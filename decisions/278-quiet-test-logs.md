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

## Moved from comments, 2026-10-07

Cut from `vitest.config.ts` at `5b180e0` by #531.

- **`LOG_LEVEL` under test.** `process.loadEnvFile` does not override a
  variable that is already set. `.env.example` sets `LOG_LEVEL=info` and the
  setup docs say to copy it, so the logger's silent-under-test default was
  being overridden for anyone who followed them, and the suite kept printing
  application logs. An `LOG_LEVEL=debug npm run test:unit` survives, because
  that was exported and not loaded from the file.
