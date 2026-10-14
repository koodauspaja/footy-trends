# 574 — The Axiom transport is given a path, and the build is checked: decisions

Bug #574, 2026-10-06. Staging stopped deploying when pino went from 10.3.1 to
10.4.0: `next build` threw `unable to determine transport target for
"@axiomhq/pino"` for every route.

## The cause

pino resolves a transport's `target` relative to the files that called
`pino.transport`. 10.4.0 finds those callers with `util.getCallSites()` where
Node has it (22.9 and later; this project runs 24), in place of parsing
`Error.stack`. Inside Next's bundled server those call sites are not paths
`createRequire` can resolve from, so every attempt fails. Compared file by file
with 10.3.1, `lib/caller.js` is the only relevant difference.

## The fix

`src/lib/logger.ts` resolves `@axiomhq/pino` itself, from the application root
(`process.cwd()`), and hands pino the absolute path. pino uses an absolute
target as given, so nothing depends on how a pino version finds its callers.

| Considered | Why not |
|---|---|
| Revert to 10.3.1 | Renovate raises the same bump again, and the build stays unchecked |
| `serverExternalPackages` for pino | it changes how the whole package is bundled to fix one string |

## Why it reached `main`

It needs two things at once: a production build, and `AXIOM_TOKEN` and
`AXIOM_DATASET` set, so that the logger creates the transport at all. No
pull-request check ran `next build`. The release gate does, but without those
two variables. Only Railway had both.

`ci.yml` gains a job, **Production build**, that runs `npm run build` with
every variable a placeholder, the two Axiom ones included. It connects to
nothing: measured locally with the database and Redis addresses pointing at
closed ports, the build passes. It is a gate only once the `main` ruleset
requires it, which is a repository setting.

## Not shown by a test

That log lines reach Axiom at runtime. A deployment with a real token shows it;
the unit test checks the path exists and the build job that the app builds.
