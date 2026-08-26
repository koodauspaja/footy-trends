# Skill: opening a pull request

When you have finished implementing a feature and tests are passing, open a pull
request using the following steps:

1. Create a feature branch named `feature/NNN-short-description` where NNN matches
   the issue and spec number.
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
           closedByPullRequestsReferences(first: 10, includeClosedPrs: true) {
             nodes { number title }
           }
         }
       }
     }'
     ```

     `includeClosedPrs: true` is required — without it the already-merged
     earlier PRs are omitted and the series looks broken. Every PR in the
     series must appear in that list once the last one has merged.
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

   This check cannot be delegated to branch protection. GitHub treats a
   `skipped` required check as satisfying the requirement, so a protected
   branch will allow a merge with no Sourcery review at all — see
   `docs/setup/011-branch-protection.md`. This step is the only thing
   enforcing it.

   Do **not** gate on the review's `commit_id` matching the head. Sourcery's
   reactions to later pushes are deliberately light and create no new review
   object, so that value stays pinned to the first reviewed commit and would
   block nearly every PR that fixed a finding.
7. A light re-check is not a full review. Sourcery reviews thoroughly when a
   PR opens; every push after that gets a lighter pass that re-checks
   existing comments, resolves addressed threads and re-runs security scans,
   but does not regenerate the summary or the full set of inline comments.
   After substantive fix commits, comment `@sourcery-ai review` on the PR to
   force a complete review of the final state, and wait for it before
   handing off.
8. Do not merge the PR yourself. Leave it for human review. **Either Miikka
   or Kalle** may be that reviewer — the two are interchangeable, so work
   never waits on one named person being available.
9. If the PR merges without the issue auto-closing (for example the closing
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