# 830 — Source maps to Sentry: decisions

Chore #830. Errors reached Sentry with stack traces into minified bundles: no
build uploaded source maps, because none had a Sentry auth token. Now Railway's
build uploads them, to the environment's own Sentry project.

| Decision | Why |
|---|---|
| `next.config.ts` names no `project`; each environment sets `SENTRY_PROJECT` | Staging and production are two Sentry projects (their DSNs' project ids differ), and the config named one slug, `javascript-nextjs`. A fixed slug would put one environment's maps in the other's project, where its errors never look for them. The Sentry plugin reads `SENTRY_PROJECT` when the option is absent |
| The token is an organisation token, one per environment, in `SENTRY_AUTH_TOKEN` | An organisation token carries only what an upload needs, and the plugin reads that variable without configuration. One per environment, so revoking one does not stop the other's uploads, as with `HEALTH_PROVIDERS_TOKEN` (decisions/814) |
| The token is also in the running app's environment | Railway gives a service's build and its runtime the same variables, and has no build-only ones. The token's `org:ci` scope only creates releases and uploads source maps, so code running in the app could at worst upload wrong ones; that code already holds `DATABASE_URL` and `BETTER_AUTH_SECRET`. Stripping it from the start command would add a step to every start for that |
| The variables are set in Railway before this record's pull request merges | `docs/infrastructure.md` says they are set, and it describes the running system. Until the merge, the config still names `javascript-nextjs`, so a build in between uploads there and nothing breaks |
| Both variables are declared in `.railway/railway.ts` | An apply removes every variable the file does not declare (decisions/521), so an undeclared token would vanish on the next apply |
| CI's production build uploads nothing | CI builds every pull request, and nothing it builds is deployed: its maps would match no error, and each build would add a release to Sentry. The token would also have to be an Actions secret that pull-request builds can read. The upload belongs with the build that is deployed |
| `.env.example` gains neither variable | A local build must not upload. Without a token the plugin skips the upload and says so |
| The plugin's default `deleteSourcemapsAfterUpload: true` is kept | The maps it generated are deleted after upload, so the deployed app does not serve them to browsers |

Verified before merge: `npm run build` without the two variables behaves as
before, skipping the upload with `No auth token provided`. The upload itself
can be seen only once the variables are set in Railway and an environment
builds: staging on the next deploy of `main`, production on the next release.
