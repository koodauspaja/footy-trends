# 318 — Where rate-limit counters live: decisions

Implementation notes for #318. `skills/bug-workflow.md` and the chore workflow
ask for one of these only when a real tradeoff was involved. This one has a
single decision behind it, and getting it wrong would have made a Redis outage
take sign-in down — which is worth writing down rather than leaving in a diff.

## The option better-auth documents is the wrong one

better-auth's documented answer is `secondaryStorage`, and `rateLimit.storage:
"secondary-storage"` reads from it. It does more than its name suggests:

> By default if secondary storage is provided the session is stored in the
> secondary storage. Reads are always done from the secondary storage.
> — `@better-auth/core/src/types/init-options.ts`

Sessions are also **deleted from the database** when it is configured. So taking
the documented path would have moved session storage out of Postgres, where
`specs/023-google-oauth-login.md` deliberately put it, and made authentication
depend on Redis being reachable — a much larger change than "count requests
somewhere shared", arrived at by following a doc rather than reading the type.

`rateLimit.customStorage` is consulted first:

```js
function getRateLimitStorage(ctx, rateLimitSettings) {
  if (ctx.options.rateLimit?.customStorage) return ctx.options.rateLimit.customStorage;
```

so only the counters move.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Which better-auth option | `rateLimit.customStorage` | Moves the counters and nothing else. `secondaryStorage` would take sessions with them. |
| What happens when Redis is down | **Fail open**, and log at error | The choice is between refusing every sign-in and enforcing no limit. An outage of a cache must not take authentication with it — the same call `/api/health` already makes, where Redis is non-fatal "because the app can serve requests without cache". Logged at `error` rather than `warn` because the protection is genuinely gone while it lasts. |
| How often an outage is logged | Once, until it recovers | Rate limiting runs on every auth request. A line each would flood Axiom for the duration of the outage and bury the one line that matters. The flag resets on recovery, so a second outage is still reported. |
| Atomicity | One Lua script, `INCR` then a guarded `EXPIRE` | better-auth's own contract says the TTL is applied "only on creation; later increments never extend it". Doing it as two round trips would let the process die between them and leave a key with no expiry. |
| What `retryAfter` reports | The key's actual `TTL` | better-auth's own secondary-storage path returns `rule.window`, which over-states the wait for anyone refused late in a window. The TTL comes back from the same script, so it costs nothing. |
| How the storage type is declared | Locally, not imported | The interface lives in `@better-auth/core`, a **transitive** dependency this project never declared. Passing the object to `betterAuth()` checks it structurally against the real type, so a changed contract still fails the build — verified by mutating the declared shape twice and watching `auth.ts` fail to compile. |

## What was not changed

The limits themselves. #309 left that open deliberately, and the defaults now in
force per client are 3 per 10 s on `/sign-in*` and 100 per 10 s elsewhere.
Moving where counters live does not argue for different numbers.

`enabled` still defaults to `isProduction`, so none of this runs locally.

## What is still unproven

That the counters actually land in Redis on a deployed instance. The unit tests
assert the decision made from what Redis answers, with the client mocked — they
cannot show that the real client reaches the real server. That is a staging
observation, and it is in the PR's checklist rather than ticked here.
