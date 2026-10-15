# 665 — Every statement on the app's database client has a timeout: decisions

Chore #665. No database read had a bound: a query that stalled instead of
failing held a page's render for as long as it stalled, and every `Analyysit`
panel awaits its read in one `Promise.all`, so one stalled read held the whole
section. Raised by Sourcery on #662, and answered there as a class fix, since
every read on the page shares the property.

| Decision | Why |
|---|---|
| `statement_timeout` on the client in `src/db/index.ts`, as a startup parameter (`connection: { statement_timeout }`) | One place covers every caller of `db`: the server, better-auth, `/api/health`, `predictions` and `backfill`. Postgres cancels the statement itself, so the connection is left usable and the caller gets an error it already handles. |
| 10 seconds | Decided by Miikka, 2026-10-15. The same bound TASO's render requests have (`decisions/363-render-timeouts.md`), and well inside Playwright's 30 s, so a stalled read shows its panel's failure line before a test or a reader gives up. |
| One value for the scripts too, measured to fit | Decided by Miikka, 2026-10-15, over exempting them: one client and one value, with no second path to keep correct. The bound is per statement, not per run, so a long script fits as long as each of its statements does. Measured on 2026-10-15 against `footy-trends_test` (5 429 football-data and 3 646 TASO matches): `predictions -- backtest` wrote 26 567 rows in 5 s with no statement reaching 200 ms (`log_min_duration_statement`), and the season-wide upsert that `-- log` and `backfill` share took 7.9 ms for the largest football-data season (552 rows) and 9.9 ms for the largest TASO one (418); `backfill --reset`'s whole-table deletes took under 5 ms each. Production was not measured: it stores the same competitions' history, and these are two to three orders of magnitude inside the bound. |
| A lock wait counts | Postgres counts the time a statement waits for a lock toward its timeout. Two syncs of one season already wait on each other (`decisions/196-concurrent-group-syncs.md`); that wait is short, and one that is not is the stall this bounds. |
| Clients that do not get it | `src/db/migrate.ts`, `scripts/grant-admin-run.ts`, `scripts/services-run.ts` and the test-support clients open their own connections. A migration may legitimately run long, and it runs before the app starts. |
| A `?statement_timeout=` in `DATABASE_URL` wins | postgres.js turns an unknown URL parameter into a startup parameter applied after `connection`. No environment sets one; it would also reach the migrator, which reads the same URL. |
| What a reader sees | Nothing new: every panel loader already turns a failed read into `{ status: "error" }` and its failure line. A cancelled refresh write is caught like any failed refresh, and the page serves the stored rows. |
