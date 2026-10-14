# 357 — A release says which domains it touches: decisions

Chore #357 had no record of its own; #531 created this one for reasons cut
from the comments of its code.

## Moved from comments, 2026-10-07

Cut from `scripts/next-version.ts` at `5b180e0` by #531.

- **`KIND_LABELS` is a denylist.** The domain taxonomy was created in one
  pass and will grow, and an allowlist would silently omit every label added
  later: the failure nobody notices, because the line still renders and just
  says less than it should.
- **`labelsOfIssueResponse`.** GitHub answers `/issues/{n}` for pull
  requests with a `pull_request` field and a `200`. This repository's squash
  commits name both, `fix: a thing (#309) (#315)`, so without the check a
  labelled pull request would contribute domains the issue never had. Pull
  requests carry no labels today, which is why it is worth checking: nothing
  would look wrong until someone labelled one.

Cut from `scripts/release-pr-plan.ts` at `5b180e0` by #531.

- **Empty domains in a release plan.** A release that touches nothing
  resolvable gets no labels, which the issue asked for explicitly.

Cut from `scripts/release-version.ts` at `5b180e0` by #531.

- **`domainsForRelease` throws.** A caller applying labels has to tell
  "this release touches nothing" from "the labels could not be read": the
  first is fine, the second would label a release with silence.
  `GH_TOKEN`/`GITHUB_TOKEN` is what CI already provides and what
  `review-findings.ts` uses; locally, `GH_TOKEN=$(gh auth token)`.
- **No `process.exit` in `release-version.ts`.** `skills/release.md` pipes
  it into a file, `--print=notes > /tmp/notes.md`, and truncated release
  notes would be published without anything failing. Letting the process end
  on its own is what flushes.
- **One resolution for `--print=json`.** Three separate spawns was the
  earlier shape, and it resolved the domains twice, once inside the notes
  and once for the labels. Nothing forced those answers to agree: a label
  created or renamed between the calls would have answered two different
  sets. Nothing is printed on the failing path, and the runner asks for this
  before creating the pull request, so a failure means no pull request
  exists to be mislabelled.
