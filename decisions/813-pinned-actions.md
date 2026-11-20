# 813 — Pinned GitHub Actions: decisions

Chore #813. `SonarSource/sonarqube-scan-action` was already pinned to a commit
hash, but GitHub's own actions ran from moving major tags: `actions/checkout@v7`
and `actions/setup-node@v7` ten times each, and `actions/upload-artifact@v7`
once. Whoever controls a tag can change the code behind it without a commit
here. `railway-environment.yml` runs with `RAILWAY_API_TOKEN`, a workspace
token that reaches production, and `release.yml` runs with the provider keys.

| Decision | Why |
|---|---|
| Every `uses:` is pinned to a full 40-character commit hash, with the release in a trailing comment (`# v7.0.1`) | A commit hash cannot be moved. The comment is what tells a reader the version, and Renovate reads it as the current version when it proposes an update. The test refuses a short hash, because only a full one names exactly one commit |
| GitHub's own actions are pinned too, not only third-party ones | The risk from `actions/*` is low, and pinning them is cheap: one line each, kept current by Renovate. One rule with no exception is also simpler to check than a list of trusted owners |
| Each hash is the commit the `v7` tag pointed to on 2026-11-21, with the most exact release at that commit as its comment: `checkout` v7.0.1, `setup-node` v7.1.0, `upload-artifact` v7.0.2 | No version changes in this pull request; the workflows run the code they ran the day before |
| Renovate extends `helpers:pinGitHubActionDigests` | `config:recommended` already updates an action pinned this way: #794 moved the Sonar action to v8.5.0 and its hash together. The preset adds the other half, pinning any action that arrives on a tag |
| `tests/unit/config/workflow-action-pins.test.ts` fails on an unpinned `uses:` and on Renovate losing the preset | Renovate pins an unpinned action only on its Monday run, after the workflow has already run on a tag. The test stops it at the pull request. It reads the YAML line by line, which covers both forms the workflows use (`- uses:` and a step's `uses:` key) without a YAML parser as a new dependency |
| Each workflow that uses an action names this record in its header | A reader who meets a hash in a workflow can find why without searching. `taso-key-check.yml` uses no action, so it is unchanged |
