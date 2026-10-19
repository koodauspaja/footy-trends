# 661 — A push of only specs and docs skips the e2e freshness check, and the check watches everything else: decisions

Chore #661, building on `decisions/084-e2e-freshness-before-push.md`. On
2026-10-15 the push of 068's spec, one Markdown file, was blocked by 27 files
that came from `main` and needed a 4.5-minute e2e run that tested nothing the
branch changed. The same day, `@sentry/nextjs` 11 (#658) changed the running
app through `package-lock.json`, which the check did not watch. This record
overrides `WATCHED_PATHS`, the list 084 started and
`decisions/568-e2e-against-a-production-build.md` extended, and the
`tests/e2e/README.md` advice to reach for `--no-verify` on a docs-only change.
The marker, the twelve-hour window and the warning without local
infrastructure stand as they were.

| Decision | Why |
|---|---|
| The hook passes with no run when every file the pushed commits change from `origin/main` is under `specs/`, `decisions/`, `docs/` or `skills/`, or is a `.md` file at the repository root | Nothing in `src/`, `tests/e2e/` or the config files reads any of them, checked with a search on 2026-10-15, so no e2e result can depend on them. `--no-verify` was the only way past before, and it skips the check for a code change that slipped in too. |
| The list names what is safe to skip, and everything else is watched | A watch list misses whatever nobody thought to add: it missed `drizzle/`, `package-lock.json`, `public/` and more. A new top-level file or directory is now watched from the moment it exists. |
| Root `.md` only, not `.md` anywhere | `tests/e2e/README.md` and any Markdown under `src/` sit next to code, and a rule by extension would also skip a `.md` file the app might one day import. |
| What the push changes is `git diff origin/main...<pushed commit>`, from where the branch left `main` | That is what the branch itself changes. The commits `main` gained since then are not the branch's, and they are what blocked 068's spec push. |
| `--no-renames` | With renames on, moving `src/x.ts` to `docs/x.ts` lists only `docs/x.ts` and the push would skip. Split, the deletion under `src/` keeps it checked. Measured with a throwaway commit on 2026-10-15. |
| The decision is `isDocumentationOnly` in `e2e-freshness-plan.ts`, the diff is `changedFromMain` in `e2e-freshness-git.ts`, and stdin is read in `e2e-freshness.ts` | The same split as the rest of the check: the decision pure, git injected, the entry point untested and excluded from coverage. |
| Anything that cannot be worked out runs the full check: no ref lines, a line not in git's four-field shape, no `origin/main`, a commit git cannot compare, an empty diff, a terminal on stdin | Passing on an unknown is the failure the issue exists to prevent. A push that only deletes a remote branch sends no commits, so it gets the full check too, as it did before. |
| The skip comes before `.env` is read and Docker is probed | A docs push should cost nothing, and with no run due, the prerequisites are not needed. |
| The fingerprint is every file `git ls-files -c -o --exclude-standard` lists, less the skip list | One list decides both halves, so the working-tree comparison cannot drift from the push comparison. The cost measured on 2026-10-15: 719 files in about 110 ms, against 94 files in about 37 ms before. |
| An untracked file that `.gitignore` does not cover now counts as a change | A scratch file outside the skip list is in the tree the build reads, so the check cannot tell it apart from code. `.gitignore` is where such files are kept out. |
| No new marker format | A marker written before this change holds only the old watched files, so every other file reads as added and the first push after the change needs one full run. A format bump would have the same effect. |
