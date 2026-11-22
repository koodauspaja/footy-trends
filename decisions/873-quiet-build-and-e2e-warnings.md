# 873 — No Sentry or client-IP warnings in builds and e2e runs: decisions

Chore #873. Two warnings printed on every CI build and e2e run, from our own configuration and not from a defect, so they taught readers to skip warnings. Sentry's plugin tried to create a release and upload source maps without a token, which only Railway's builds have (`decisions/830-sentry-source-maps.md`), and announced it sends telemetry. Better Auth found no client address on Playwright's requests, which Railway's edge would carry as `x-real-ip` (`decisions/309-client-ip-resolution.md`).

| Decision | Why |
|---|---|
| **`next.config.ts` reads `SENTRY_AUTH_TOKEN` once: without it, the release has an empty name and source maps are `"disable-upload"`** | The plugin calls its release step whatever `release.create` says, and that step warns about a missing token, organisation or project before it looks at `create`. Its first check is for a release name, and with none it stops at debug level. The plugin keeps an empty name as given (`??`), so it is not replaced by the commit. `"disable-upload"` drops only the upload: debug ids are still injected, as before |
| **With the token, the options are the plugin's defaults**, as before this change | Railway's builds must still create a release and upload, which #830's open boxes wait for. That is checked on Railway's next build log, not locally |
| **`telemetry: false`**, everywhere | The plugin's data about itself is no use to us, and its notice was one of the lines |
| **Playwright sends `x-real-ip: 127.0.0.1` on every request** (`use.extraHTTPHeaders`) | It is the header production resolves, so the e2e runs exercise the same path. Page-level headers the specs set are merged with it, not instead of it. Rate limiting then has one address for the whole run, which is what the fallback's single shared bucket already was, so no spec's limits change |
| **Better Auth's warning stays on** | In production it is the sign that the edge stopped sending `x-real-ip` |

Measured on 2026-11-23 with `CI=true npm run build`, which is how CI builds: `main`'s config printed the telemetry notice and the release and upload warnings, and this change printed neither. The warnings read "No project provided" there, not CI's "No auth token provided", because that machine has a `.env.sentry-build-plugin`; the plugin's info line naming that file is the one line left, and CI has no such file. A plain local build was quiet before too: the config sets `silent: !process.env.CI`.
