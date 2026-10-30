# 650 — TypeScript 7: adopt with 7.1, as a full upgrade: decisions

Chore #650. TypeScript 7, the native port of the compiler, is `latest` on npm at
7.0.2, and `7.1.0-beta` is out. The repository is on 6.0.3, held there in
`renovate.json` because 7.0 ships no in-process parser and three tests parse our
source with it. This investigation changes no dependency. Measured on
2026-10-30 against `main` at `3e8b5ec`.

## What uses the `typescript` package

| Consumer | 7.0.2 | 7.1.0-beta |
|---|---|---|
| `tsc --noEmit` (`npm run typecheck`, the pre-commit hook, CI) | Runs: errors only in the four files below, which import the 6.x API | The same, plus `scripts/railway-environment.ts:19`: the destructured `{ input, env } = {}` no longer takes its type from `Steps` (TS7031). 6.0.3 and 7.0.2 accept it |
| `next build`'s TypeScript step (Next 16.4.3) | Runs on the installed 7.x and fails on the same four files; nothing else | The same |
| `scripts/comment-rules.ts`, `tests/unit/app/rendering-mode.test.ts`, `tests/unit/app/theme-tokens.test.ts`, `tests/unit/scripts/backfill-run.test.ts` | Broken: the package root is `lib/version.cjs`, with no `createSourceFile` or `transpileModule` | Portable: `typescript/sync` has an `API` client with `createSourceFile` and `transpileModule`, and `typescript/ast` has `getChildren` and the `is*` predicates. Not ported: the API differs from 6.x, so each file is rewritten |
| Next's tsconfig `plugins` entry (`createTSPlugin`) | Not loaded: 7.x ships no `tsserver` and no plugin loading, only `tsc.js` | The same |
| SonarCloud's analyser | Untested: its log reads "Creating TypeScript(6.0.3) program", but 6.0.3 has been ours since the first commit, so the log cannot tell our package from a bundled one. Only a pull request run on 7.x shows it | The same |

## Timings

On this machine, three runs each; the first run of each is cold.

| | 6.0.3 | 7.0.2 | 7.1.0-beta |
|---|---|---|---|
| `tsc --noEmit` | 14.8 s, 2.8 s, 2.3 s | 1.5 s, 0.4 s, 0.4 s | 1.1 s, 0.3 s, 0.3 s |
| pre-commit hook (Biome, then `tsc`) | 10.0 s, 3.5 s, 2.9 s | 1.9 s, 0.9 s, 0.9 s | not run |
| CI's Typecheck step, last six green runs | 10–16 s | not measured: CI runs only on a pull request, and this one changes no dependency | not measured |

The 7.x runs reported the four files' errors and still checked the whole
program; a ported tree was not timed. 7.1's parser through the sync API: one file 13 ms, the 31 pages
133 ms to parse and 18 ms to walk, the client starting in under 5 ms.

| Decision | Why |
|---|---|
| Adopt TypeScript 7 when 7.1 is stable, not now | 7.0 cannot parse in-process, which is what blocked #43. 7.1's API removes that block, but it is a beta, and it already checks one file differently from 6.0.3 and 7.0.2 |
| A full upgrade, with the four consumers ported to 7.1's API | The other option, 7 for `tsc` with 6.x kept as a second package for parsing, was built and rejected on #392: 24 MB more install, and a parser reading our source at a different version from the compiler checking it |
| Not 7.0 for `typecheck` only | The same two compilers in one tree, for a check that takes 10–16 s in CI today |
| Losing Next's editor plugin is accepted | It gives editor hints only; the build, CI and Sonar do not use it. 7.x has no plugin loading to keep it |
| The follow-up is chore #744, which waits for 7.1 stable | This issue changes no dependency |
| The follow-up chore verifies on a Railway environment from its branch (`npm run railway:environment`) and on its own pull request | The environment builds and runs the site on 7; only the pull request runs CI's type check and Sonar, the two consumers not measured here |
