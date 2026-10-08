# Project instructions

## Hard rules

- **Features only:** do not begin implementation until the spec checklist in
  `skills/write-spec.md` has been confirmed in chat for the feature being
  built. A missing item — especially Edge Cases, Caching, or Acceptance
  Criteria — means stop and ask, not fill in a reasonable-sounding default.
  A guessed edge case is worse than no edge case, because it looks
  intentional in review.
- **Features only:** every PR references its spec (`specs/NNN-feature-name.md`)
  and writes a decision record (`decisions/NNN-feature-name.md`), per
  `skills/open-pr.md`.
- **Chores and bugs have no spec, and a decision record whenever they change
  something meaningful**: `decisions/NNN-short-name.md`, numbered by the issue.
  One with nothing to explain writes none, and neither creates placeholder files
  under `specs/` or `decisions/`. `skills/chore-workflow.md` and
  `skills/bug-workflow.md` govern their own work types and have their own
  numbered steps.
- **Decision records are added, not edited.** A later record says which earlier
  one it overrides, and the earlier one stays as it was. The one addition an
  existing record takes is a reason cut from a comment: it goes to the record of
  the change that last wrote that comment, found with `git blame`, under a
  dated heading naming the file and the commit it was cut at.
- **A comment says what a thing is for**: one to three lines about the thing
  itself, or a constraint the code cannot show. Then the decision records behind
  it, the original feature's first and the later ones after it, oldest first:

  ```ts
  /**
   * Turns a cup's knockout matches into ties, one row per pairing with the legs
   * aggregated.
   *
   * decisions/014-champions-league.md
   * decisions/015-finnish-cups.md
   */
  ```

  The paths go on a declaration's doc comment or the file's header; a field's
  comment and a comment inside a function are covered by the declaration they
  sit in, or by the header. History (how it used to work, which pull request
  found it, what a reviewer said) goes in the record, never the comment, and no comment cites an issue or
  pull request number. `tests/unit/scripts/comment-rules.test.ts` fails on a new
  citation, on a cited record that does not exist, on a doc comment stacked
  on another, and on a test name that cites an issue, a spec or a spec section or is
  not written as a string (`decisions/584-test-names-carry-no-citations.md`). Comments not yet in this shape are trimmed file by file, by the
  next pull request that rewrites them or in batches of at most 150 000 diff
  characters. A comment a pull request only moves, word for word, onto the
  thing it describes is not rewritten, and waits for its batch. `decisions/531-comments-say-what-code-is-for.md` has the reasons.
- **What does not vary by work type are the gates.** Feature, chore or bug, the
  same three points belong to a human: agreeing the work, authorising the start,
  and merging. Steps 2, 4 and 7 of the Required workflow below state them for
  features; `skills/chore-workflow.md` and `skills/bug-workflow.md` state the
  same two start-side gates in the same words. Nothing about lacking a spec
  makes a chore cheaper to begin unasked.
- Before handing off or merging any PR, tick every checkbox its issue has —
  Acceptance criteria always, plus Scope where the template provides it. A box
  is ticked because the outcome was **verified**, not because the code was
  written; if a criterion says a page renders something, load it and look. A
  criterion that cannot be ticked honestly gets said out loud on the issue
  rather than left blank or ticked anyway. This is skipped easily, because
  nothing fails when it is: #158 was implemented, verified, merged and closed
  with all eight boxes empty.
- **Claude never moves a card to `Ready`, and never merges a pull request, on
  its own initiative.** Either is fine when a human instructs it, in whatever
  words they like — no particular phrasing is required, and "in those words" is
  not the test. The test is whether a sentence the human actually wrote
  instructs it. Claude's own inference, however reasonable, is not
  authorisation, and neither is being confident or being green. When Claude sets
  `Ready` itself it quotes the sentence it is acting on, so the evidence is
  visible rather than in its head.
- **Every new source file is imported by a test, or excluded with a reason.**
  `npm run test:unit` fails otherwise — `scripts/coverage-gaps.ts` compares the
  source tree against the coverage report and names anything missing, then
  checks lcov for a condition never taken. Neither is the same as low coverage:
  `vitest --coverage` measures only what a test *imports*, so a file nothing
  imports is **absent** from the report and the summary still says 100%, while
  Sonar indexes the tree and scores it 0% — and vitest's v8 branch model can
  read 100% while lcov, which Sonar consumes, still has conditions never taken.
  That has cost three pull requests: `admin-user-table.tsx` and
  `app/admin/page.tsx` in #370, `generate-migration.ts` in #376,
  `refresh-actions.ts` in #381. Server actions, route files and thin wrappers
  are the usual victims, because they feel too small to test.
- **Unit coverage is 100%, and the thresholds that hold it there are not
  lowered.** `vitest.config.ts` fails `npm run test:unit` below 100% of
  statements, branches, functions or lines. An uncovered line gets a test, or
  its file an exclusion with a reason in `sonar-project.properties`; a
  threshold is never lowered or removed to get a change through.
- **Every migration is named.** `npm run db:generate -- --name=<verb>_<what>`,
  with the verb one of `add`, `create`, `alter`, `drop`, `rename`, `backfill` —
  `--name=add_refresh_runs`, never the two random words `drizzle-kit` invents
  when it is given none. Seven reached `main` as `0016_young_meteorite` and
  `0013_fair_captain_stacy` before anyone noticed, and such a name tells a
  reader nothing at the one moment it matters: reading back through an incident.
  The wrapper refuses an unnamed migration and
  `tests/unit/db/migrations.test.ts` fails if one exists anyway, so this is
  written here to explain the rule rather than to be the only thing enforcing
  it.
- **Renaming a migration is safe; editing an applied one is not.** The migrator
  finds a file by its journal `tag` and hashes the file's *contents*, so
  renaming the `.sql` and its `tag` together leaves the hash untouched and
  already-migrated environments skip it. Changing the SQL of a migration that
  has run anywhere changes the hash and breaks that environment's next deploy —
  add a new migration instead.
- All user-facing UI strings are Finnish. All code, comments, specs, and
  decision records are English. Quoting a Finnish UI string as data is not
  writing in Finnish and is expected — 67 test files assert one and 24 specs
  quote one to say what the user sees.
- Every GitHub issue must have both its label and its Issue Type field set,
  matched to the issue kind: `enhancement` label → `Feature` type, `chore`
  label → `Task` type, `bug` label → `Bug` type. The `gh` CLI has no
  `--type` flag for `issue create`/`issue edit`; set it via
  `gh api repos/:owner/:repo/issues/NUMBER -X PATCH -f type="Feature"` (or
  `Task`/`Bug`) right after creating or editing the issue — `:owner`/`:repo`
  are resolved by `gh` itself from the current repository.
- Every GitHub issue — feature, bug, or chore alike — must be added to the
  `Footy Trends` Project board (status `Backlog`) immediately after
  creation. The repo has no GitHub-native "auto-add to project" workflow
  configured, so this is a manual step every time, not something that
  happens on its own. See `docs/setup/002-github-project-board.md` for the
  exact command and board IDs.

## Required workflow

**This is the feature path.** A chore follows `skills/chore-workflow.md` and a
bug follows `skills/bug-workflow.md`; they skip steps 1 and 2 because they have
no spec, and their own step 2 carries the same authorisation gate as step 4
here. Steps 4, 6 and 7 read the same for all three.

1. Write or update the spec in `specs/NNN-feature-name.md`, following
   `skills/write-spec.md`. **A human initiates the spec and is responsible for
   the outcome**; how much of the drafting Claude does varies by feature, which
   is why this step is "we write it" rather than either name alone.

2. **Confirm the spec in chat.** Every open question is answered, and the human
   says **go**.

   Claude never declares this itself. Engagement is not agreement: "what's
   next?", "do you have what you need?", "splitting it is fine", and silence are
   all *not* a go. Writing "treating the checklist as confirmed" is Claude
   inventing the checkpoint rather than passing it.

3. **After the go, update the GitHub issue** so it carries the spec's scope and
   acceptance criteria, per `skills/open-issue.md`. This is how the spec reaches
   the people who approve it — they read the issue, not the chat, and not files
   on Claude's machine.

4. **Never start without having asked whether the issue is good and been
   answered.** A human-set `Ready` card *is* an answer — putting it there is the
   human saying they read the issue and approved it. In every other situation,
   ask, and wait.

   The human decides whether to read it, then authorises the start. **Either of
   these alone is enough:** they move the card to `Ready` themselves — the
   column means "ready for Claude Code", so its presence is the authorisation —
   or they say so, in **any wording**. All of these are a start:

   - "looks good, update issue and start work"
   - "yes, looks good, you can go ahead with the implementation"
   - "issue in ready now"

   Until something like that arrives: no branch, no code, no migration, no board
   change.

   **When Claude sets `Ready` itself, it must quote the sentence it is acting
   on, in the same message.** Not as a password — as evidence. The quote has to
   read, plainly, as an instruction to start. These are *not* one, and Claude has
   treated each of them as one:

   - "#119 next, right? you got all you need?" — a question about order
   - "if you see value splitting this feature, it's ok too" — permission to
     reshape the work, not to begin it
   - silence, or Claude's own summary saying the checklist is confirmed

   If there is nothing quotable that tells Claude to start, the answer is to ask
   — which is this step.

5. **The card passes through `Ready` either way**, then `In Progress`, before a
   branch exists. If the human moved it to `Ready`, nothing to do. If they
   authorised the start without moving it, Claude moves it there first, quoting
   the sentence it is acting on — so the board records that a human approved the
   work rather than showing it appearing in `In Progress` from nowhere.

6. Implement autonomously within the spec: decision record in
   `decisions/NNN-feature-name.md`, tests, the pass in `skills/self-review.md`,
   then a PR per `skills/open-pr.md`, tick the issue's boxes, and move the card
   to `In Review`. The target is **zero** Sourcery and Sonar findings — findings
   answered after the fact are not the same thing.

7. The human checks the result and merges, **or tells Claude to merge**. However
   green it is.

Steps 2, 4 and 7 are the three points where a human decides. Everything Claude
does sits between them, never across one.

## Reference

- How the running system is set up **now**, and its constraints:
  `docs/infrastructure.md`. Read it before deciding anything about hosting,
  environments, variables, CI, the board or the review tools. **A change to
  infrastructure updates it in the same pull request**, and a fact in it that
  the live system contradicts is a bug to fix on sight.
- Standing the infrastructure up from zero: `docs/setup/` (a procedure, in the
  order `docs/setup/README.md` gives; not a description of the current state).
- Spec checklist: `skills/write-spec.md`.
- PR workflow: `skills/open-pr.md`.
- **Why code is the way it is.** Before changing code, read the decision records
  its comments link to, then search `decisions/` and `specs/` for its file and
  function names, then its history (`git log -L`, `git log -S`). This is a normal
  step of every change, not a fallback.
- Chore workflow (no spec; a decision record when it changes something
  meaningful): `skills/chore-workflow.md`.
- The pass to run **before** requesting a review: `skills/self-review.md` — the
  defect classes measured from this repository's own review history, with the
  counter to each. `npm run review:findings` re-measures them, and the list
  changes when it does.
- Release workflow (promoting `main` to `release`): `skills/release.md`.
- Bug workflow (no new spec; reference the existing one it violates; a
  decision record when it changes something meaningful): `skills/bug-workflow.md`.
- Review rules (also enforced by Sourcery): `REVIEW_RULES.md`.
