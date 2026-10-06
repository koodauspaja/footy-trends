# 521 — Railway's settings as Infrastructure as Code: decisions

Chore #521 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `.railway/railway.ts` at `5b180e0` by #531.

- **`.railway/railway.ts` replaces `railway.toml`.** Railway's Config as
  Code is deprecated, and stops being read on 2026-12-01. The build and
  deploy values are the ones that file set, except the restart policy type,
  left to Railway's default. The source and the variables are new: the file
  never set them, but an apply removes what is not declared.
- **Applying it.** `railway config plan`, then `railway config apply`, with
  the CLI linked to staging and then to production;
  `docs/setup/025-railway-infrastructure-as-code.md` has the steps.
- **A named partial.** The file owns only the services it declares. Without
  `partial` it would describe the whole project, and an apply would delete
  everything missing from it: Postgres, Redis and the `predictions` cron
  service. That service stays in the dashboard (`docs/setup/024`): it never
  used `railway.toml`, so the cutoff does not touch it, and it exists in
  production only.
- **Everything is declared.** The first staging plan, before this was
  understood, would have deleted all of the service's variables and detached
  its GitHub source. So the source is declared with each environment's
  branch, and every variable by name with `preserve()`: Railway keeps the
  value it holds, and no value is in the repository. A variable added in the
  dashboard must be added to the file before the next apply, or that apply
  deletes it; `railway config plan` shows it as a deletion. Railway's own
  `RAILWAY_*` variables are provided, not declared.
- **Only the named environments evaluate.** Any other name throws, so an
  apply linked to a third environment fails before it plans: falling back to
  staging's branch and variable list would delete whatever that environment
  holds beyond it. A new environment is #522.
- **Written by hand.** `railway config migrate` drops the restart policy
  (railwayapp/cli#1199). The CLI ignores unknown keys without a word, so
  `tests/unit/railway-config.test.ts` pins every value. Each environment's
  branch is in `docs/setup/021`.
