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
| What happens when Redis is down | **Degrade to in-process counting**, and log at error | Refusing every sign-in because a cache is down would take authentication with it — the call `/api/health` already makes, where Redis is non-fatal "because the app can serve requests without cache". But failing fully *open* would mean this change had **removed** a protection: an in-process `Map` cannot have an outage, so there was nothing to lose before. Counting in memory turns a shared limiter into a per-instance one — precisely what better-auth does by default and what this repository ran until now, so the change is no worse than the status quo in any scenario. Logged at `error` because the guarantee is weaker while it lasts. |
| Bounding the fallback map | Sweep expired keys past 10 000 entries | Windows are 10-60 s, so in a long outage almost everything held is already dead. Sweeping on a threshold is one pass when it is needed rather than a timer, and it deletes only what has expired — clearing indiscriminately would hand every client a fresh allowance at the moment the map is busiest. |
| Trusting Redis's reply | Validate it is two numbers | `as [number, number]` is a cast, not a check. On a malformed reply `count` was `undefined`, and `undefined <= rule.max` is `false` — so an unexpected answer would have **refused every request** instead of degrading. Found while re-reading for the fallback, not by a test failing. |
| How often an outage is logged | Once, until it recovers | Rate limiting runs on every auth request. A line each would flood Axiom for the duration of the outage and bury the one line that matters. The flag resets on recovery, so a second outage is still reported. |
| Atomicity | One Lua script, `INCR` then a guarded `EXPIRE` | better-auth's own contract says the TTL is applied "only on creation; later increments never extend it". Doing it as two round trips would let the process die between them and leave a key with no expiry. |
| What `retryAfter` reports | The key's actual `TTL` | better-auth's own secondary-storage path returns `rule.window`, which over-states the wait for anyone refused late in a window. The TTL comes back from the same script, so it costs nothing. |
| How the storage type is declared | Locally, not imported | The interface lives in `@better-auth/core`, a **transitive** dependency this project never declared. Passing the object to `betterAuth()` checks it structurally against the real type, so a changed contract still fails the build — verified by mutating the declared shape twice and watching `auth.ts` fail to compile. |

## What was not changed

The limits themselves. #309 left that open deliberately, and the defaults now in
force per client are 3 per 10 s on `/sign-in*` and 100 per 10 s elsewhere.
Moving where counters live does not argue for different numbers.

`enabled` still defaults to `isProduction`, so none of this runs locally.

## The review's objection, and why it was right

Sourcery approved the change and then flagged the fail-open path: during an
outage the limit is gone, and reverting cannot undo requests accepted while it
was.

The harm it named does not apply here. `emailAndPassword` is not configured,
Google is the only provider, and every path better-auth guards with the strict
3-per-10 s rule is a password path that does not exist in this app. There is no
credential to brute-force — the secret lives at Google.

It was still right about the *shape* of the problem, and for a reason worth
separating from the odds: **the thing it replaced could not fail.** Weighing
"how likely is a Redis outage, and how bad" was the wrong frame, because a
fallback removes the question rather than answering it, for about twenty lines.

## What the second review round changed

Three findings, all of them real, and the middle one is the sort a test would
never have caught because nothing was wrong with any single call:

| Finding | Why it mattered |
|---|---|
| A `TTL` of `0` reported the whole window | Redis answers `TTL` in whole seconds **rounded to nearest**, so a key with 400 ms left reports `0` — and `ttl > 0` fell through to `rule.window`. Now floored at one second, which is also what the in-memory path's `Math.ceil` produces, so the two paths agree. |
| Recovery handed out a **second allowance** | Clearing the degraded flag switched straight back to Redis. A client that had just spent its window in memory met a Redis key that had expired or never existed, so `INCR` restarted it at 1 *inside a window it had already used up* — both allowances spendable back to back. An in-memory entry is now enforced until it closes, with the stricter of the two answers winning. |
| Fake timers restored at the end of a test body | A failed assertion left them installed for every later test in the file, turning one failure into a cascade of unrelated ones. Moved into `afterEach`, and verified with a throwaway spec that throws on purpose. |

The second is worth keeping in mind beyond this file: a fallback is not finished
when it starts working, only when **coming back** is also correct.

## What is still unproven

That the counters actually land in Redis on a deployed instance. The unit tests
assert the decision made from what Redis answers, with the client mocked — they
cannot show that the real client reaches the real server. That is a staging
observation, and it is in the PR's checklist rather than ticked here.
