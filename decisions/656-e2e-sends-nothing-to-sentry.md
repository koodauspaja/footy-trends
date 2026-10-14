# 656 — The end-to-end suite sends nothing to Sentry, and nothing traces every request: decisions

Chore #656. On 2026-10-14 the staging project, `footytrends-test`, took about
653 K spans in a day, roughly 100–140 K an hour while e2e ran, and used up the
organisation's span quota, pausing production's tracing with it. The errors
quota went the same way: 2.3 K events of `The destination stream closed early.`
on `GET /foreign/standings`, from one user. That is React aborting a streamed
render because the client disconnected, which a test does when it moves on
before a page has finished. The source was local runs: the developer's `.env`
held staging's DSN, against `docs/setup/017`'s "Locally, leave it empty", and
staging traced every request. This record overrides decisions/140 on the
sample rate's default, and decisions/531's note above `.env.example`'s
`SENTRY_TRACES_SAMPLE_RATE=` that blank means 100% tracing; their other
defaults stand.

| Decision | Why |
|---|---|
| Playwright's server runs with `NEXT_PUBLIC_SENTRY_DSN` blank (`withoutSentry` in `scripts/e2e-target.ts`) | The suite stops depending on what a developer's `.env` holds. A blank DSN disables the SDK. The `fresh-build` target builds inside that command, so the inlined browser value is blank too, and `dev` reads it at start. |
| Blank, not removed | Next's `.env` loading fills a variable that is unset but keeps one set to an empty string, measured with `@next/env`'s `loadEnvConfig`. Removing it would let `.env`'s DSN back in. |
| A `prebuilt` build keeps the DSN it was built with, so the guarantee is `fresh-build`'s and `dev`'s | `NEXT_PUBLIC_` values are inlined at build time, in the browser bundle and the server's alike, so a blank at serve time cannot reach them. `release.yml` builds with no Sentry variable at all, so CI's run sends nothing; a local `E2E_TARGET=build` run sends whatever its build carries. Said on the target and on `withoutSentry` rather than guarded: telling a DSN from the build output would be a second reading of what the build already decided. |
| `DEFAULT_TRACES_SAMPLE_RATE` is `0.1`, not the wizard's `1` | Decided by Miikka, 2026-10-14, over setting staging's rate in Railway: no variable to declare, set and apply, and any environment that sets nothing, staging and a local run included, samples as production does. Production sets `0.1` itself and does not change. |
| No `ignoreErrors` for the stream error | It came from tests; a real reader leaving mid-load produces it rarely, and ignoring it in production is a separate decision (#656, Out of scope). |

## Measured

On 2026-10-14, with `NEXT_PUBLIC_SENTRY_DSN` set in the shell to a fake
ingest on `127.0.0.1`, which `.env` cannot override:

| Run | Tests | Envelopes received |
|---|---|---|
| The whole suite, with `withoutSentry` | 396 | 0 |
| `womens-team.spec.ts`, with the blank removed (the control) | 10 | 23 |
