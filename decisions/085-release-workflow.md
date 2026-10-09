# 085 — A release workflow: decisions

Chore #085 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-06

Cut from `src/app/api/health/route.ts` at `ef7eb13` by #531.

- **`deployedCommit`.** "Which version is in production?" becomes a request
  and not dashboard archaeology. Locally and in tests there is no deployment
  behind it, and `null` is the honest answer. `?? null` alone would report
  `""` for a variable that exists but is empty, which reads as "the commit is
  the empty string" and a probe cannot tell that from "unknown". The commit
  and not a version string: the tag is derived from it
  (`git tag --points-at`), so the two cannot drift the way a hand-maintained
  version would. See `skills/release.md`.

## Moved from comments, 2026-10-07

Cut from `scripts/next-version.ts` at `5b180e0` by #531.

- **`next-version.ts`.** Nobody has to remember whether the last three
  weeks were a patch or a minor. The repository writes conventional commit
  subjects (`feat:`, `fix:`, `chore:` …), which is what makes it possible.
  An unrecognised commit still changed something, and silently contributing
  nothing is the one behaviour that would make the number wrong.
- **`isStableVersionTag`.** A tag somebody once created by hand would
  otherwise take the whole release workflow down.
- **`selectPreviousTag`.** Ordinarily the newest tag. It matters on a rerun:
  if the tag was pushed but publishing the release notes failed, the tag
  points at HEAD, and treating it as the previous tag would compute an empty
  range and strand the release with no notes and no way to recover by
  rerunning. Skipping it reproduces the original range, and so the same
  version.
- **`isMergeSubject`.** `release-version.ts` passes `--no-merges`, which
  settles it by topology; this only catches a caller that collected commits
  some other way. A merge subject can be edited, so it is the fallback and
  not the mechanism.
- **`firstReleaseVersion` as an option.** Whether a project's first tag is
  0.x or 1.0.0 is a statement about stability and not a fact about its
  changes. A mistyped override must not silently produce a version nobody
  intended. Known limitation, accepted and not guarded: a repository whose
  only tags are pre-release or malformed also has no previous tag, so a
  stale override would apply there. Guarding it needs a second definition of
  "has this been tagged", and having two produced six rounds of
  contradictions before they were reduced back to one. The variable is set
  once for a first release, and a rerun never reads it, so the case needs
  both an unused override and a tagging convention this repository does not
  use.
- **A first release's notes.** `release` was branched from `main` and
  already carried everything before it. Presenting the promotion range as
  the release's contents understates it by two orders of magnitude, on the
  one release where a reader is least able to tell.
- **The issue references are removed in two passes.** Removing the refs and
  then collapsing whitespace is linear and says what it does.

Cut from `scripts/release-version.ts` at `5b180e0` by #531.

- **How `release-version.ts` is called.**
  `npm run release:version` compares `origin/release..origin/main`;
  `-- A B` any two refs; `-- --since-last-tag` the last tag to HEAD, for use
  after the merge; `-- --print=version` prints just the number, for scripts;
  `-- --print=notes` the Markdown release notes; `-- --print=json`
  `{version, notes, domains}`, resolved once. Every mode but the last reads
  git alone, and `--print=notes` makes no request at all, so a release can
  always be cut.
- **`--no-merges`.** A release produces a merge commit, and matching on
  "Merge pull request" is a heuristic where an authoritative answer is
  available.
- **A rerun under `--since-last-tag`.** The range is read from the release
  branch after the merge, and a rerun can then publish notes that failed to
  publish the first time. Validating `FIRST_RELEASE_VERSION` first would let
  a variable changed to something invalid after the first release fail a
  rerun that was never going to use it.
- **Replacing the decision on a rerun.** Leaving `previous`,
  `isFirstRelease` and the reasons describing a derivation that was
  discarded would have the report explain how it reached a version it is not
  using. Forcing `isFirstRelease` false made the notes say "Changes since
  v0.0.0." where they should say "First release."

Cut from `playwright.config.ts` at `5b180e0` by #531.

- **`E2E_TARGET=build`.** A release gate should exercise what ships, not
  the dev server; reusing a `next dev` while claiming to test what ships
  would report on the dev server. `webServer` runs a single command under a
  start-up timeout a full build would blow through, so the workflow builds.
  The suite runs in CI on pull requests targeting `release` and on pushes to
  it, per #81.
