# 780 — A release's domains reach through its pull requests: decisions

Chore #780. Adds to `decisions/357-release-domains.md`. A release pull request
is labelled with the domains of the issues its commits reference. Feature and
bug commits reference only their pull request, `feat: 079 — … (#776)`, and a
pull request contributed no domains, so v2.0.0's release pull request (#779)
was labelled `ci` alone, with eight Arvauspeli features in it.

| Decision | Why |
|---|---|
| A referenced pull request contributes the labels of the issues it closes, the ones in its Development panel (`closingIssuesReferences`) | Those issues carry the domains. The closing keyword that fills the panel is already required on every pull request (`skills/open-pr.md`), so the link is there to follow |
| A pull request's own labels still count for nothing | 357's reason stands: a labelled pull request would contribute domains its issue never had. The query does not ask for them, so the REST response's `pull_request` check that enforced it is gone, and `labelsOfIssueResponse` with it |
| One GraphQL query per reference, `issueOrPullRequest`, instead of REST `/issues/{n}` | One request answers both kinds of number: an issue's labels, or a pull request's closing issues with their labels. REST would need a second request for every pull request |
| An issue reached both directly and through its pull request counts once | `domainsFrom` already deduplicates labels, so `chore: … (#765) (#773)` gives each domain once without deduplicating issue numbers first |
| A number that is no issue or pull request contributes nothing; any other GraphQL error throws | GraphQL answers a missing number with a 200 and a `NOT_FOUND` error at `repository.issueOrPullRequest`, where REST answered 404, which was skipped before. A `NOT_FOUND` anywhere else, such as a repository that cannot be resolved at `repository`, would skip every reference, so it throws. Every other failure stops the release pull request, as a failed label read always has (357) |
| An answer that is not the expected shape throws, instead of contributing nothing | `labelsOfIssueResponse` answered an unexpected payload with no labels, and skipped a label without a name. A release labelled from an answer that could not be read is the silent gap 357 exists to prevent, and a pull request without its closing issues would be one |
| An answer holding fewer labels or closing issues than its `totalCount` throws | The query reads the first 100 of each. No issue here comes close, and a cap reached is a release that says less than it should, so it fails instead of truncating, as the repository label list follows its pages rather than capping them (361) |
| Every reference is looked up at once, as before, with no pacing | The query costs 1 point of the 5 000 an hour (`rateLimit { cost }`, measured on #776), so a release of a few dozen references uses a few dozen |
| A reference above GraphQL's 32-bit `Int` is sent as it is | GitHub answers 2147483648 and 9007199254740991 with the same `NOT_FOUND` as any missing number (measured), so it contributes nothing rather than failing |
| Renovate's pull requests keep contributing nothing | They close no issue, so the list of closing issues is empty |

Checked on the branch: `GH_TOKEN=$(gh auth token) npx tsx
scripts/release-version.ts v1.20.0 cd92415 --print=json` resolved the domains
`ci`, `guessing-game`, `predictions`. On `main` the same command resolved `ci`.
