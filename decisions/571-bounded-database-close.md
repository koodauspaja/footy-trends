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

Two seconds because cleanup runs after the work has been awaited: nothing is
in flight to lose, and a healthy close finishes long before it. The cost is
that a run which failed to connect ends up to two seconds later.

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

The test runs the script against a refused port only. The other two cases were
run by hand; the never-answering one takes the driver's 30-second connect
timeout, too long for the unit suite.
