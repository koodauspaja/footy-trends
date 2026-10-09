# 603 — Server-side records: decisions

Chore #603, split from #538. Three things the server did left no line in Axiom:
an admin changing shared data, a sign-in being refused, and the hourly
predictions run's result. Each now logs one.

## The lines

| Event | Where it is logged | Level | Fields |
|---|---|---|---|
| A role change | `changeRole`, `src/lib/admin-users.ts` | `info` | `actingAdminId`, `targetUserId`, `role`, `outcome` |
| A user deletion | `deleteUser`, same file | `info` | `actingAdminId`, `targetUserId`, `outcome` |
| A forced refresh applied | `applyRefreshAction`, `src/lib/refresh-actions.ts` | `info` | `source`, `code`, `seasonId`, `adminId`, `outcome` |
| A refused sign-in | `signInRefusal`, `src/lib/sign-in-allowlist.ts` | `warn` | none |
| The hourly predictions run | `runPredictionLog`, `src/lib/prediction-log-service.ts` | `info` | `refreshed`, `logged`, `failures` |

## Why they are shaped this way

| Decision | Why |
|---|---|
| One line per attempt, with `outcome` either `ok` or the refusal's reason | The issue asks for who did it, to what, and the outcome. A refusal (`self`, `last_admin`, `stale`) is an outcome too, and one line with a field is one thing to search for. |
| A write that threw logs no `info` line | It already logs at `error` with the same ids, and two lines for one event would count it twice. |
| The admin lines are after the transaction has returned | A line written inside it would record a change a rollback then undid. |
| The refresh line is in the action, the user lines are in the library | `applyRefresh` returns from six places, and its caller sees every one of them as a single result. `changeRole` and `deleteUser` each have one. Both actions are the only callers of what they wrap. |
| Ids only, and nothing at all for a refused sign-in | Logs leave for a third party and the repository is public. The address is the only thing known about a refused identity, so the line carries no fields. |
| A refused sign-in is `warn` | It is the app saying no to someone, like the forced refresh's refusals, which are `warn` already. |
| The predictions summary is logged by the run, not by `scripts/predictions.ts` | The script is excluded from coverage as an entry point, so a line there could be removed without a test failing. It still prints the same summary to stdout for Railway's cron log. |
| The backtest logs nothing new | It is run by hand, by someone reading its output. |

## Not established here

`validateUserInfo` runs before `create-user`, on `link-account` and on every
OAuth `sign-in`. Whether one refused attempt calls it more than once, and so
logs more than one line, was not measured.

None of the lines was seen in Axiom from this change: the unit tests assert
the logger calls, and the datasets are only written by the deployed
environments.
