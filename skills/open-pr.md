# Skill: opening a pull request

When you have finished implementing a feature and tests are passing, open a pull
request using the following steps:

1. Create a feature branch named `feature/NNN-short-description` where NNN is the
   **spec** number — the `NNN` in `specs/NNN-feature-name.md`, not the issue
   number. The two matched in the first few features and have not for a long
   time.

   That is what keeps the trail lined up: the branch, `specs/NNN-*.md`,
   `decisions/NNN-*.md` and the pull request all carry the same number, so any
   one of them leads to the rest.

   **Chores and bugs use the issue number** instead, because they have no spec —
   `chore/172-branch-naming-spec-number`, `bug/220-freshness-deleted-files`. The
   asymmetry is deliberate: each kind of branch is numbered by the document that
   defines it, and for a chore or a bug that document is the issue.
2. Commit all changes with a conventional commit message, e.g.
   `feat: add standings form table (#NNN)`.
3. Check the diff size against the PR's base branch before pushing:
   `git diff <base-branch> | wc -c` (counts bytes, not characters — close
   enough for this check even with the occasional Finnish ä/ö/é in a diff,
   since Sourcery's own limit is also approximate). Sourcery skips review
   entirely — no findings, no automated check — on a PR over its per-PR cap.

   **This repo is on Sourcery Pro: 300,000 diff characters per PR, and a
   rolling seven-day budget of 1,500,000 per seat.** Both numbers are
   plan-dependent, so they change if the plan does:

   | Plan | Per PR | Rolling 7 days |
   |---|---|---|
   | Open Source | 150,000 | 250,000 per developer |
   | **Pro** (this repo) | **300,000** | **1,500,000 per seat** |
   | Team / Enterprise | 500,000 | 2,500,000 per seat |

   Aim comfortably under the per-PR cap (~250,000 characters), not right at
   the edge. If you're over, split the feature into smaller, stacked PRs
   (implement and merge one, then branch the next from it) rather than
   opening one oversized PR; see `decisions/006-other-competitions.md` for
   a worked example of this split. A stacked series references its issue
   differently from a single PR — read the *stacked series* rule in step 5
   before writing the first PR body, because getting the timing wrong there
   either closes the issue early or leaves three of four PRs unlinked.

   The rolling budget is separate from the per-PR cap, so an under-the-limit
   PR can still be skipped if reviews earlier in the week used up the shared
   budget — splitting a PR does not avoid that, it makes it worse. There's no
   way to check remaining budget ahead of time; a `skipped` check-run with a
   rate-limit message is the only signal, and the fix is to wait.

   Source: <https://docs.sourcery.ai/admin/plans/>. Confirmed for this account
   on 2026-08-25 — worth stating, because the repo is public and Sourcery
   applies the Open Source plan to public repositories by default, so the
   pricing page alone does not settle which row applies here.
4. Push the branch and open a PR against main.
5. Fill in the PR template:
   - Reference the GitHub Issue number with a closing keyword — `Closes #NNN`
     (or `Fixes #NNN` / `Resolves #NNN`) — never a bare mention like
     `Refs #NNN` or `#NNN` on its own. GitHub only populates the PR↔issue
     link (the Development panel, and the project board's "Linked pull
     requests" field) when a closing keyword is present; anything else
     leaves the two disconnected even though the text still displays a
     cross-reference. The link is mandatory. That it also auto-closes the
     issue on merge is an accepted side effect, not a reason to avoid it —
     do not omit or reword the keyword to dodge it.
   - **A stacked series defers the keyword; it never drops it.** Only the PR
     carrying a closing keyword appears in the Development panel, so a
     stacked series written the obvious way shows one PR out of four. Use
     this timing instead:

     1. While stacking, write `Part of #NNN` on every PR **but the last**, so
        merging an early one does not close the issue prematurely.
     2. The final PR carries `Closes #NNN` as normal.
     3. **After each earlier PR merges**, edit its body to `Closes #NNN`.
        GitHub adds it to the Development panel retroactively and does *not*
        close the issue — the close fires at merge time, not on a body edit.

     This does not contradict the rule above. That rule forbids rewording the
     keyword to *dodge* the auto-close; here every PR in the series ends up
     carrying it and the issue still closes exactly once, on the final merge.
     The keyword is deferred by a few minutes, not avoided.

     `gh pr edit --body` silently no-ops in this repo — it exits zero and
     changes nothing — so that retroactive edit needs the REST API:

     ```sh
     gh api repos/:owner/:repo/pulls/<PR> -X PATCH -f body="$(cat body.md)"
     ```

     Verify the result with `closedByPullRequestsReferences`, **not** the
     issue timeline, which renders a bare cross-reference and a real closing
     link indistinguishably:

     ```sh
     gh api graphql -f query='
     {
       repository(owner: "koodauspaja", name: "footy-trends") {
         issue(number: NNN) {
           closedByPullRequestsReferences(first: 50, includeClosedPrs: true) {
             nodes { number title }
           }
         }
       }
     }'
     ```

     `includeClosedPrs: true` is required — without it the already-merged
     earlier PRs are omitted and the series looks broken. Count the returned
     nodes against the number of PRs you opened rather than skimming the
     list, and raise `first` if a series ever exceeds it: the connection
     truncates silently, so a short answer reads the same as a complete one.
     Every PR in the series must appear once the last one has merged.
   - **A closing keyword in a squash commit body closes the issue too**, and
     backticks or surrounding prose do not exempt it. #141 was closed by a
     commit body reading "`Closes #141` lands on the follow-up" — a sentence
     written to say the keyword belonged somewhere else. When a merge must
     not close the issue, the phrase cannot appear in the commit body in any
     form; write "the closing keyword lands on the follow-up" instead. GitHub
     scans the squash commit message as well as the PR body, so a clean PR
     body does not protect you.
   - Link the spec file path
   - Link the decisions file path
   - Write a one or two sentence summary of what was built
   - List the steps a reviewer should take to verify the feature works
6. Verify Sourcery actually reviewed the commit that would be merged, before
   handing the PR off. Query the check-run at the PR head — not
   `gh pr checks`, which reports the *latest* state rather than that
   commit's:

   ```sh
   HEAD=$(gh pr view <PR> --json headRefOid -q .headRefOid)
   gh api "repos/:owner/:repo/commits/$HEAD/check-runs" \
     -q '.check_runs[]|select(.name|test("Sourcery";"i"))|.conclusion'
   ```

   It must be `success`. A `skipped` conclusion means Sourcery declined —
   see "When Sourcery skips" below — and is a **hard block**: the PR waits
   until a review completes. Do not merge on a stale green check, and do not
   propose merging with a caveat.

   **The one exception: a diff with nothing in it for Sourcery to review.**
   Sourcery reviews source. A pull request that touches only dependency
   metadata, a lockfile or similar can legitimately produce a green check and
   no review at all — #212 changed two lines in `package.json`'s
   `allowScripts` and got exactly that. Under a rule with no exception such a
   PR is unmergeable for ever, so the rule gets set aside by hand, which is
   worse than having no rule.

   The exception is an **allowlist**, not "everything that is not source".
   Only these paths count as unreviewable:

   ```
   package.json
   package-lock.json
   ```

   Everything else is reviewable, **including documentation and workflows**.
   Sourcery reviews prose, `.github/` and `skills/` perfectly well — the
   findings that produced this very section came from a pull request whose
   entire diff was three Markdown files. Defining the carve-out by exclusion
   would have let those bypass the gate, which is the opposite of the intent.

   Establish it rather than assume it. List what actually changed, and check
   every path is on the allowlist:

   ```sh
   git diff --name-only origin/main...HEAD
   ```

   If every path is on it, a missing review is expected and the PR may merge —
   say so explicitly in the PR, naming the paths. **One path off the list and
   the hard block stands for the whole PR**, however small that path's diff.

   The distinction is *what Sourcery reviews*, not how risky the change looks.
   Two lines of lockfile are low-risk and unreviewable; two lines in
   `src/lib/` are low-risk and very much reviewable. Only the second property
   matters here.

   If a future PR hits a genuinely unreviewable path that is not on the list,
   add it here in that PR, with the evidence that Sourcery produced nothing for
   it — do not widen the rule from memory.

   This check cannot be delegated to branch protection. GitHub treats a
   `skipped` required check as satisfying the requirement, so a protected
   branch will allow a merge with no Sourcery review at all — see
   `docs/setup/011-branch-protection.md`. This step is the only thing
   enforcing it.

   Do **not** gate on the review's `commit_id` matching the head. Sourcery's
   reactions to later pushes are deliberately light and create no new review
   object, so that value stays pinned to the first reviewed commit and would
   block nearly every PR that fixed a finding.
7. **Read the review threads before merging, every time.** The check-run
   query above tells you a review happened. It does not tell you what it
   said, and `mergeStateStatus: CLEAN` says only that the required checks
   passed — never that anyone read the comments.

   ```sh
   gh api graphql -f query='{repository(owner:"koodauspaja",name:"footy-trends"){
     pullRequest(number:<PR>){reviewThreads(first:100){
       pageInfo{hasNextPage endCursor}
       nodes{isResolved comments(first:1){nodes{path body createdAt}}}}}}}' \
     --jq '.data.repository.pullRequest.reviewThreads
           | "hasNextPage=\(.pageInfo.hasNextPage)",
             (.nodes[] | select(.isResolved==false))'
   ```

   **Check `hasNextPage` before believing the result.** A page size silently
   truncates: if it is `true`, an unresolved thread can sit past the end and
   the command prints nothing for it, which reads identically to "all clear".
   Page with `after: "<endCursor>"` until it is `false`.

   Nothing unresolved may remain. Findings can also arrive **after** you have
   replied to and resolved an earlier thread, so re-run this immediately
   before merging rather than relying on having looked once: #229 was merged
   on a green state with two findings on it that were eleven minutes old.

8. A light re-check is not a full review. Sourcery reviews thoroughly when a
   PR opens; every push after that gets a lighter pass that re-checks
   existing comments, resolves addressed threads and re-runs security scans,
   but does not regenerate the summary or the full set of inline comments.
   After substantive fix commits, comment `@sourcery-ai review` on the PR to
   force a complete review of the final state, and wait for it before
   handing off.
9. Do not merge the PR yourself. Leave it for human review. **Either Miikka
   or Kalle** may be that reviewer — the two are interchangeable, so work
   never waits on one named person being available.
10. If the PR merges without the issue auto-closing (for example the closing
   keyword was missing or malformed), close the issue manually and note in a
   comment which PR shipped it. This does not apply to the earlier PRs of a
   stacked series, which are *meant* to merge without closing — there, do the
   retroactive body edit from step 5 instead and leave the issue open until
   the last PR merges.

## When Sourcery skips

The check reports `skipped`, and there are three causes worth telling apart:

- **The per-PR size cap** — over 300,000 diff characters on Pro, per step 3.
- **The rolling seven-day budget** — diff characters across the account
  (1,500,000 per seat on Pro), independent of the per-PR cap. Splitting a PR
  does not avoid it.
- **The automatic re-review cap** — five automatic re-reviews per PR. Past
  that Sourcery stops reacting on its own.

`@sourcery-ai review` resets the re-review counter and runs a full review
from scratch, so it clears the third case. It does not create budget, and the
other two need different fixes: an oversized PR must be **split**, since
waiting never shrinks its diff, while an exhausted budget can only be
**waited** out, since splitting spends it faster.

Note that Sourcery's own docs are explicit that "a rate limit never blocks a
merge" — it skips the review and GitHub goes green. That is exactly why the
merge gate in step 6 checks for a real review of the head commit rather than
trusting the check's colour.

## Update a stale branch by rebase, not merge

`main` requires branches to be up to date, so a pull request that falls behind
must be updated before it can merge. **Rebase it**:

```sh
git fetch origin main
git rebase origin/main
git push --force-with-lease
```

Not `git merge origin/main`. Both produce a mergeable branch; only the merge
produces a **merge-commit head**, and Sourcery's required check goes missing far
more often on those (#236). Measured across one day's pull requests:

| Head | Sourcery check reported without intervention |
|---|---|
| Single-parent | 7 of 8 |
| Merge commit | 1 of 6 |

A rebase does **not** guarantee the check arrives — the one single-parent
exception was this very pull request, whose check never started at all while
Sourcery was demonstrably working on another minutes earlier. It shifts the
odds, and that is all it claims to do.

So the load-bearing rule is the next paragraph, not this one: **a missing check
is re-requested, never waited on**, whatever shape the head is.

**It is safe here specifically.** The `main` ruleset targets `~DEFAULT_BRANCH`
only, so feature branches carry no `non_fast_forward` rule and force-pushing to
one is allowed; and `main` requires **0** approving reviews, so
`dismiss_stale_reviews_on_push` costs nothing. Neither holds for `release` — but
release pull requests never need this, because #221 dropped the up-to-date
requirement there.

Use `--force-with-lease`, not `--force`: it protects against a remote update
since you last fetched, but it does not detect another checkout. Before
force-pushing, get explicit coordination from anyone else who may have the
branch checked out, or use a separate branch.

**Rebase only your own unmerged branch.** If someone else has it checked out,
merge instead and accept the re-request — a rewritten history someone else is
standing on costs more than a missing check.

**If the check is missing, re-request it. Do not wait.** Sourcery can simply
fail to start on a commit — observed on both head shapes — and nothing arrives
later to fix it:

```sh
gh pr comment <PR> --body "@sourcery-ai review"
```

That is the remedy in every case. Rebasing reduces how often you need it; it
does not replace it.

## Neither signal is trustworthy on its own

Both halves have been seen to fail, on the same day:

| Seen on | Failure | Consequence |
|---|---|---|
| #212 | **A check with no review.** The check-run went green having reviewed nothing | Branch protection is satisfied and the PR merges unreviewed |
| #229 | **A review with no check.** Sourcery reviewed and approved the head but posted no check-run | `Sourcery review` is a required check on `main`, so the PR sat `BLOCKED` indefinitely on a review that had already happened |

The second needs an explicit `@sourcery-ai review` comment to make Sourcery
report; waiting does not fix it. Treat a PR blocked on a missing Sourcery
check the same way — re-request, do not assume it is coming.

So: the check-run says a review ran, the threads say what it found, and the
merge state says neither. Step 6 and step 7 exist because no one of them is
enough.