# 571 — Closing the database is bounded: decisions

Bug #571, 2026-10-09. `npm run predictions -- backtest` and `-- log` printed
nothing and exited 0 when the database could not be reached. The hourly cron
runs `log`, so Railway would have marked such a run successful.

## The cause

Measured, with postgres 3.4.9 against a port that refuses the connection:

| Queries started together | Then `sql.end()` |
|---|---|
| one | resolves |
| two | never settles |

Both commands start with two queries at once (`readFinished` and
`readCandidates` each read `matches` and `taso_matches` under one
`Promise.all`), so the driver opens two connections. The first refusal rejects
the `Promise.all`, and the script's `finally` calls `closeDatabase()` while the
second connection is still opening. The driver's `end()` for a connection in
that state returns a promise that only its `terminate()` resolves, and the
failed connect that follows never calls it.

Nothing else was left on the event loop, so Node ended the process with
`main()` still pending: a preloaded `beforeExit` handler fired with exit code 0
and no rejection had reached `main().catch(...)`. That is the missing message
and the exit code together.

The issue suspected the `finally` block, which is where it stops, but not
closing a client "whose connection never opened": that alone closes cleanly.
`redis.quit()` resolves at once on a client that never connected.

## The fix

`closeDatabase()` passes the driver a timeout, `CLOSE_TIMEOUT_SECONDS` (2).
The driver then races its close against a timer that destroys what is left, so
the close settles, the original rejection reaches `main().catch(...)`, and the
run prints one line and exits 1. The timer is also what holds the event loop
open until then.

Two seconds because a healthy close finishes long before it. The cost is that
a run which failed to connect ends up to two seconds later.

## What the bound may cut off

A close without a bound waits for every query in flight; a bounded one drops
those still running when the time is up. Cleanup follows the work, but a
`Promise.all` rejects on its first failure and leaves its siblings running, so
on a failed run something can still be in flight when the close starts.

| Started together | In flight when one fails | Dropped by the bound |
|---|---|---|
| the reads in `readFinished`, `readCandidates` and the baselines | other reads | harmless: the run has failed and a read stores nothing |
| the refreshes | none: each catches its own failure | nothing |
| the write batches in `writePredictions` | other batches | rows that would have been stored |

So `writePredictions` waits for every batch it started with
`Promise.allSettled`, then fails the run with the first failure. A failed
write still fails the run (`decisions/052-predictions-log.md`); the batches
that could be stored are, as they were before the bound. Sourcery raised this
on the pull request.

The backfill writes one competition-season at a time, each awaited, so it has
no batch to cut off.

`scripts/predictions.ts` also takes the reason out of the driver's error with
`describeError`, as the backfill does. Without it the line was drizzle's
`Failed query: …` with the whole statement and its parameters, and the reason
(`ECONNREFUSED`) only in `cause`.

| Considered | Why not |
|---|---|
| Report the failure before cleanup, in a `catch` | the close would still never settle; the exit would rest on the event loop happening to drain |
| `process.exit(1)` on failure | it can truncate output not yet flushed, the reason `closeDatabase` exists (`decisions/169-production-backfill.md`) |
| A `beforeExit` guard that fails a pending `main()` | a second source of truth for whether the run finished; the close that hangs would still be there |

## The same close elsewhere

| Where | Close | Affected |
|---|---|---|
| `scripts/backfill-run.ts` | `closeDatabase()` | fixed with it. Its first query is a single reachability probe, so an unreachable database was already reported (measured: `Cannot reach the database: …`, exit 1); a connection lost mid-run with queries in flight could have hung the same way |
| `scripts/grant-admin-run.ts` | its own client, `end()` | no: one transaction, one connection (measured: `Error: connect ECONNREFUSED`, exit 1). Left as it is |
| `src/db/migrate.ts` | its own client, `max: 1`, `end()` | no: one connection. Left as it is |
| `scripts/services-run.ts` | `end({ timeout: 1 })` | already bounded |

## Measured after the fix

Both commands, each of the issue's three cases:

| `DATABASE_URL` points at | stderr | Exit |
|---|---|---|
| a port that refuses the connection | `Predictions failed: connect ECONNREFUSED 127.0.0.1:59999` | 1, after 3 to 4 s |
| an address that never answers | `Predictions failed: write CONNECT_TIMEOUT 10.255.255.1:5432` | 1, after 34 s |
| a host name that does not resolve | `Predictions failed: getaddrinfo ENOTFOUND db.footy-trends.invalid` | 1, after 4 s |

## Not shown by a test

The test runs the script against a listener it holds, which drops every
connection (measured by hand: `Predictions failed: read ECONNRESET`, exit 1,
and nothing printed with exit 0 without the fix). It holds the port because one
opened and closed could be taken by another process before the script
connects. The issue's three cases were run by hand; the never-answering one
takes the driver's 30-second connect timeout, too long for the unit suite.
