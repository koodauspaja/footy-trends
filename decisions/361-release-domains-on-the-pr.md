# 361 — The release's domains on the release PR: decisions

Chore #361 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/next-version.ts` at `5b180e0` by #531.

- **No `Touches:` line in the release notes.** The domains were also a line
  in the notes, and two renderings of one fact is one more than can be kept
  true. The labels are the ones a reader filters and searches by, so they
  are the ones that stayed.

Cut from `scripts/release-pr.ts` at `5b180e0` by #531.

- **`release-pr.ts` is a script and not a documented shell block.** It was
  a sequence of commands in `skills/release.md`, and review found a defect
  in it seven rounds running: an `xargs` that runs on empty input, a `$pr`
  left empty by a failed create, a status id remembered and not read, a
  verification whose exit status nothing consumed. Each fix added more
  shell, which added more surface. A shell block in a document cannot be
  tested and so cannot be finished. Everything the release needs to decide
  is in `next-version.ts`, which is unit tested; this carries it out in one
  place, with real error handling and no `set -e` folklore.
- **No `PATH` in `release-pr.ts`.** A release carried out by whichever
  binary happened to be first in somebody's path is not one to trust.
  Importing `release-version.ts` would run it, print a report, and set an
  exit code.
- **The child's failure.** `execFileSync` forwards the child's stderr and
  repeats it inside the error it throws, so rethrowing that verbatim printed
  the reason twice.
- **One plan, asked first.** Asking separately meant two spawns and two
  resolutions of the same question.
- **The board is read first.** Creating the pull request first meant a board
  whose Status options had been renamed left a release opened, labelled and
  filed under no status: a half-built release somebody then has to finish by
  hand.
- **The top-level `try`.** Everything below `main` fails by throwing (a
  missing token, a board with no such column, a `gh` that exited non-zero),
  and an uncaught throw printed twelve lines of `node:internal/errors` with
  the actual cause somewhere above it, if it was forwarded at all.

Cut from `scripts/release-pr-plan.ts` at `5b180e0` by #531.

- **`release-pr-plan.ts`.** The same split as `e2e-freshness-plan.ts` and
  its entry point.
- **`INITIAL_STATUS`.** Opening the pull request is the work starting; the
  review starts when a reviewer is requested. The board's built-in
  `Pull request merged` workflow carries the card to Done, but GitHub
  publishes no built-in workflow for "review requested", and an Actions job
  cannot stand in for one cheaply: `GITHUB_TOKEN` is scoped to the
  repository and cannot access Projects at all, so moving a card from CI
  needs a classic personal access token with `project` and `repo`, or a
  GitHub App with organization-project write, kept as a repository secret.
  Requesting the review is already a human action; asking that human to drag
  the card is a smaller cost than a long-lived credential in the repository.
- **`selectStatusOption` reads the ids.** A hard-coded option id fails with
  "does not belong to the field", and a command whose stderr is hidden then
  leaves the card where it was while appearing to have worked, which
  happened to several cards while this was being built, because the id in
  the notes was not the id on the board. The payload is parsed JSON from a
  subprocess, so nothing about its shape is assumed; a throw somewhere less
  obvious is the alternative.
- **`gh` as data.** The argument lists were inline in the runner, which then
  had thirty-three lines no test could reach and Sonar scored at 0%. They
  are the part that can be wrong: a missing `--base`, a label flag that
  interpolates a value into a key, a `field-list` without `--format json`
  whose output then fails to parse. What stays in the runner is
  `execFileSync` and nothing else.
- **`addLabel`.** `gh api -f` sends one form field. GitHub creates an
  unknown label silently and does not refuse, so the mistake is invisible
  until someone reads the pull request.
- **`parseReleasePlan`.** A cast would put `undefined` into a
  `gh pr create --title` and open a release called `release: undefined`. The
  lesson of the Redis reply in `rate-limit-storage.ts`, where
  `as [number, number]` would have refused every request had the reply ever
  changed shape.

Cut from `scripts/release-version.ts` at `5b180e0` by #531.

- **`githubToken`.** `??` falls back only for undefined and null, and CI
  can set `GH_TOKEN=""` from an unpopulated secret.
- **`repositoryLabels` is authenticated.** Unauthenticated requests have
  their own much smaller rate limit, so this one call could be refused while
  every other succeeded.
- **`labelsThatExist`.** GitHub creates a label it has never seen when one
  is added to an issue, verified against a real pull request, where a
  deliberately misspelled name appeared in the repository's label list. A
  domain the taxonomy has drifted away from would not fail loudly; it would
  quietly mint a junk label for somebody to find later. A gap in the
  taxonomy is worth noticing, hence stderr.
- **A missing token.** It was one condition with "no domains", which was
  right while `--print=notes` was the caller: notes without domains beat a
  release that cannot be cut. Only `--print=json` calls it now, and there
  "no token" answering the same as "no domains" would open an unlabelled
  release and call it done.
- **Statuses in the label lookup.** A 401 on a bad token or a 403 on a rate
  limit is not that issue being absent, and would otherwise report every
  release as touching nothing.
- **A failed label lookup exits non-zero.** `--print=json` must not let a
  caller apply no labels and call it done.
