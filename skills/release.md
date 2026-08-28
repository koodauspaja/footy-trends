# Skill: cutting a release

Purpose
Promote `main` to `release`, which is what production deploys from, and give
the result a version number derived from the commits it contains rather than
chosen by hand.

Run this every time something is released. The version is computed, so two
people releasing in different weeks arrive at the same number for the same
contents.

## The shape of it

| | |
|---|---|
| Staging | deploys from `main`, continuously |
| Production | deploys from `release` |
| The human gate | `release` requires a pull request and **1 approving review**. GitHub forbids approving your own, so a release always takes both people |
| The automated gate | `.github/workflows/release.yml` — unit, integration and e2e against a production build |
| The version | an annotated tag, created **by the workflow** once the merge is green |

You do three things: run the skill, get the other person to approve, and merge.
Everything after the merge — tag, release notes, deploy — happens on its own.

## How the version is decided

`scripts/next-version.ts` reads the conventional commit subjects in the
promotion range and applies semver:

| In the range | Bump |
|---|---|
| any `feat!:` / `fix!:` / a `BREAKING CHANGE:` footer | major |
| any `feat:` | minor |
| anything else — `fix`, `chore`, `docs`, `refactor`, `test`, `ci` | patch |

Three rules worth knowing before the number surprises you:

- **Below 1.0.0, a breaking change moves the minor, not the major.** Reaching
  1.0.0 says the thing is stable, and that is a decision to take deliberately
  rather than one to arrive at because a commit had a `!` in it.
- **An unparseable subject counts as a patch**, not as nothing. A commit that
  does not follow the convention still changed something, and contributing
  silently zero is the one behaviour that would make the number wrong.
- **The first release is chosen, not derived.** `release` already contains the
  whole history, so the promotion range describes only what followed the branch
  point — one docs commit would otherwise name the first production release
  `v0.0.1`. The tool defaults to `v0.1.0` and says it is doing so.

  To name it something else — going straight to `v1.0.0`, say — set the
  repository variable `FIRST_RELEASE_VERSION`. Whether a first tag is 0.x or
  1.0.0 is a statement about stability rather than a fact about the commits,
  which is why it is the one thing the tool will not decide.

  It is honoured only when the promotion range finds no previous tag — that is,
  on a genuine first release. Two things keep it from touching anything later:

  - Once a release is tagged, the next promotion finds that tag and derives from
    it, so the override is never consulted. There is no need to unset it.
  - A **rerun** never consults it either. If the commit is already tagged, that
    tag *is* the version — the job reuses it rather than deriving a second
    answer that could disagree with the tag it is about to publish notes for.
    That holds even if the variable has since been changed, or made invalid.

  A mistyped value fails loudly rather than falling back to the default.

Merge commits are excluded — a release produces one, and it carries no type.

## Steps

1. **Fetch, so the range and the tags are real.**

   ```bash
   git fetch origin --tags
   ```

2. **Compute the version and read what is in the release.**

   ```bash
   npm run release:version
   ```

   It prints the range, the bump and why, the next version, and the commits
   grouped as breaking / features / fixes / other.

3. **Check what is actually being shipped.** Read that commit list. If
   something in it should not go to production yet, stop — this is the last
   point at which that is cheap. Nothing has been tagged or promoted yet.

4. **Open the release pull request**, `main` into `release`:

   ```bash
   npm run release:version --silent -- --print=notes > /tmp/notes.md
   gh pr create --base release --head main \
     --title "release: $(npm run release:version --silent -- --print=version)" \
     --body-file /tmp/notes.md
   ```

   Do **not** write `Closes #N` for issues their own pull requests already
   closed.

5. **Get the approving review.** This is the gate, and it is a person reading
   step 3's list, not a formality. `release.yml` must also be green — unit,
   integration, and e2e against a production build. A red e2e means production
   is broken; that is what the job is for.

6. **Merge with a merge commit.** The ruleset allows nothing else, deliberately:
   a merge commit keeps `main`'s SHAs on `release`, so the deployed commit maps
   back to a commit that exists on `main`. Squash or rebase would mint new ones
   and break that mapping — which is the whole point of wanting a known version
   in production.

That is the end of the manual part.

## What happens on its own after the merge

1. `release.yml` runs again, on the push this time.
2. Its `tag` job waits for unit, integration and e2e to pass, then creates the
   annotated tag on the merge commit and publishes the release notes with
   `gh release create`.
3. Railway deploys `release`, running migrations before the new container takes
   traffic.

The tag is created **after** the tests pass and **only** on a merge, never on a
pull request. A tag is permanent and public, so it must not be possible to
create one for a release that was rejected or that failed.

**Confirm it landed:**

```bash
curl -s https://<production>/api/health | jq
git fetch --tags && git tag --points-at "$(curl -s https://<production>/api/health | jq -r .commit)"
```

`/api/health` reports the commit actually running; the tag pointing at that
commit is the version. The commit is authoritative and the tag is derived from
it, so the two cannot drift the way a hand-maintained version string does.

## If the release is bad

- **Migrations are forward-only.** `preDeployCommand` runs `npm run db:migrate`
  on every deploy, and redeploying an earlier commit does *not* roll the schema
  back. A bad migration is recovered by writing a new one.
- **Reverting means a new release**: revert on `main`, promote again, and the
  workflow tags the new version. Do not force-push `release` — the ruleset
  forbids it, and it would leave a tag pointing at a commit no longer on the
  branch.
- **A hotfix** goes `hotfix/*` → pull request into `release` (same gate), then
  **back-merge `release` into `main`** — or the next release silently reverts
  the fix.

## Notes

- The version does not live in `package.json`, and should not be put there. The
  tag is the version; a second copy is a second thing to keep in step, and it
  drifts.
- `npm run release:version -- <from> <to>` computes for any two refs, which is
  useful for seeing what a release *would* be before opening anything.
- `--since-last-tag` is what the workflow uses after the merge, when
  `origin/release..origin/main` is empty because everything is already on
  `release`.
