# 814 — The health endpoint's TASO check needs a token: decisions

Chore #814. `/api/health?providers=1` is public, and every request to it was a
real, uncached TASO request made with the shared key, from production's
address. TASO blocks busy addresses, so anyone calling it in a loop could get
production's address or key refused, and with them the domestic pages and the
hourly `predictions` run. This adds to `decisions/113-taso-key-monitor.md` and
overrides nothing in it: the daily monitor still asks production for a live
TASO answer.

| Decision | Why |
|---|---|
| The check needs a token in the `x-health-providers-token` header, not a cached result | Without the token a request makes no TASO call at all, however many arrive. A cache of a minute or two would still let anyone cause one call per window from production's address. It would also need a lock against requests arriving together at expiry, a choice of what to do when Redis is down (the route treats Redis as optional), and a way past the cache for the monitor, which needs a fresh answer. Agreed on the issue, 2026-11-21 |
| The token is the variable `HEALTH_PROVIDERS_TOKEN`. Unset or blank, no request reaches TASO | Fails closed: an environment nobody gave a token, a new one from `railway-environment.yml` among them, cannot be made to call TASO |
| A request without the token, or with a wrong one, gets the answer `?providers` absent gets: no `checks.taso`, status 200 | No different answer for a wrong token: the endpoint tells nobody whether a guess came close, and a probe's status never depends on it |
| Each value is hashed with SHA-256 before `timingSafeEqual` | `timingSafeEqual` needs two buffers of one length. Hashing both makes them so, and the comparison then takes the same time whatever was sent |
| Staging and production each hold their own value. The GitHub Actions secret holds production's | Only production is monitored. A value read from staging opens nothing in production |
| `railway-environment.yml` and the `predictions` service get no token | The monitor calls only production, and the cron never calls the health endpoint. A new environment that wants the check would generate its own value, as it does `BETTER_AUTH_SECRET`, rather than share one |
| The monitor sends the header through `curl -H @-` | The token stays off the command line, where a process listing would show it |
| The monitor names a missing `checks.taso` as a token problem | Without the token the body has no TASO check. Reported as a TASO failure, it would send whoever reads it to re-scrape a key that works |
| The e2e suite sets a token of its own in `playwright.config.ts`, and the TASO spec sends it | The suite's server inherits the config's environment, so its token is whatever the config says, not whatever `.env` holds |
| `HEALTH_PROVIDERS_TOKEN` is declared in `.railway/railway.ts` | An apply removes every variable the file does not declare (decisions/521) |

## Set on 2026-11-21

Before the pull request was opened, so the deployed code reads a variable that
is already there. Each value is 32 random bytes in hex. Both Railway values were
set with `--skip-deploys` and read back as matching the value meant for them.

| Where | Value |
|---|---|
| GitHub Actions secret `HEALTH_PROVIDERS_TOKEN` | production's |
| Railway, `footy-trends`, staging | staging's own |
| Railway, `footy-trends`, production | production's |
