# 230 — A script proves Sentry receives events from production: decisions

Chore #230 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/verify-sentry-plan.ts` at `5b180e0` by #531.

- **`verify-sentry-plan.ts`.** The same split as `backfill-plan.ts` and its
  entry point.
- **`describeDsn`.** The host and project id answer "which project did this
  go to", the whole question the operator is asking. An unrecognised string
  is not echoed, as it might be a secret in an unexpected shape.
- **`buildMarker`.** Distinctive enough not to collide with a real error,
  and two runs an hour apart are told apart.
- **`describeOutcome`.** A project's inbound filters or rate limits can
  still drop a flushed event, so the message never claims more than
  delivery, and always sends the operator to look.

Cut from `scripts/verify-sentry.ts` at `5b180e0` by #531.

- **`verify:sentry` is a script and not a route.** The wizard's example
  routes proved the integration once and were deleted in #204, because
  anything reachable in production is reachable by anyone, and theirs logged
  through `Sentry.logger`, which `LOG_LEVEL` does not govern. A script adds
  no surface to the deployed app: nothing to guard, nothing to stumble into,
  nothing a crawler can hit. It is called as
  `SENTRY_TRACES_SAMPLE_RATE=… NEXT_PUBLIC_SENTRY_DSN=… npm run verify:sentry`.
- **It covers the server runtime only.** Reaching the edge runtime means
  running code inside the edge sandbox, which a command-line script cannot
  do; the gap is real and stated. The client half needs no test event, since
  `NEXT_PUBLIC_` values are inlined at build time and can be read straight
  out of the shipped bundle.
- **The environment is the operator's.** Against production that means
  production's variables, the way `npm run backfill` takes production's
  `DATABASE_URL`; the values in `.env` prove only the local configuration.
