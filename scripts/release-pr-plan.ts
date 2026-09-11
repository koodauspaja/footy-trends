/**
 * The decisions behind opening the release pull request, kept free of `gh` and
 * the network so they can be unit-tested directly — the same split as
 * `e2e-freshness-plan.ts` and its entry point.
 */

/**
 * The board column a release pull request starts in.
 *
 * **In Progress, not In Review.** Opening the pull request is the work
 * starting; the review starts when a reviewer is requested.
 *
 * That leaves one move unautomated, and deliberately. The board's built-in
 * `Pull request merged` workflow carries the card to Done on its own, but
 * GitHub publishes no built-in workflow for "review requested", and an Actions
 * job cannot stand in for one cheaply: `GITHUB_TOKEN` is scoped to the
 * repository and cannot access Projects at all, so moving a card from CI needs
 * a classic personal access token with `project` and `repo`, or a GitHub App
 * with organization-project write, kept as a repository secret. Requesting the
 * review is already a human action; asking that human to drag the card is a
 * smaller cost than a long-lived credential in the repository.
 */
export const INITIAL_STATUS = "In Progress";

/** One `gh project field-list` field, as far as this needs to know it. */
export type ProjectField = {
  id?: unknown;
  name?: unknown;
  options?: { id?: unknown; name?: unknown }[];
};

export type StatusSelection = { fieldId: string; optionId: string };

/**
 * The Status field and the option to start in, from what `gh` answered.
 *
 * **Read, never remembered.** A hard-coded option id fails with "does not
 * belong to the field", and a command whose stderr is hidden then leaves the
 * card where it was while appearing to have worked — which is exactly what
 * happened to several cards while this feature was being built, because the id
 * in my notes was not the id on the board.
 *
 * The payload is parsed JSON from a subprocess, so nothing about its shape is
 * assumed: a missing field, a missing option, or a name that is not a string
 * all answer `null` rather than throwing somewhere less obvious.
 */
export function selectStatusOption(
  fields: unknown,
  optionName: string = INITIAL_STATUS
): StatusSelection | null {
  if (typeof fields !== "object" || fields === null) return null;
  const list = (fields as { fields?: unknown }).fields;
  if (!Array.isArray(list)) return null;

  // No `typeof name === "string"` beside this: comparing to `"Status"` already
  // says it, and the extra half is a branch no input can take.
  const status = list.find((field) => (field as ProjectField).name === "Status") as
    | ProjectField
    | undefined;
  if (status === undefined || typeof status.id !== "string") return null;

  const options = Array.isArray(status.options) ? status.options : [];
  const option = options.find((candidate) => candidate?.name === optionName);
  if (option === undefined || typeof option.id !== "string") return null;

  return { fieldId: status.id, optionId: option.id };
}

/**
 * The issue number at the end of a pull request URL, or null when the URL does
 * not end in one.
 *
 * `gh pr create` prints the URL and nothing else, so this is how the number is
 * recovered for the labels call.
 */
export function pullNumberFrom(url: string): string | null {
  // One pattern rather than splitting and testing: `split` always returns at
  // least one element, so the fallback that shape needs is a branch no input
  // can take.
  return /\/(\d+)$/.exec(url.trim())?.[1] ?? null;
}

/** The board this repository's cards live on. */
export const PROJECT_NUMBER = "2";
export const PROJECT_OWNER = "koodauspaja";

/**
 * Every `gh` argument list the release needs, as data.
 *
 * These were inline in the runner, which then had thirty-three lines no test
 * could reach and Sonar scored at 0%. The argument lists are the part that can
 * actually be wrong — a missing `--base`, a label flag that interpolates a
 * value into a key, a `field-list` without `--format json` whose output then
 * fails to parse — so they belong on this side of the split, where a test can
 * read them. What stays in the runner is `execFileSync` and nothing else.
 */
export const gh = {
  createPullRequest: (version: string): string[] => [
    "pr",
    "create",
    "--base",
    "release",
    "--head",
    "main",
    "--title",
    `release: ${version}`,
    "--body-file",
    "-",
  ],

  /**
   * One request per label, and `labels[]=` rather than a comma-joined string:
   * `gh api -f` sends one form field, so a joined value would create a single
   * label named after all of them. GitHub creates an unknown label silently
   * instead of refusing, so that mistake is invisible until someone reads the
   * pull request.
   */
  addLabel: (pullNumber: string, label: string): string[] => [
    "api",
    `repos/:owner/:repo/issues/${pullNumber}/labels`,
    "-X",
    "POST",
    "-f",
    `labels[]=${label}`,
  ],

  addToProject: (url: string): string[] => [
    "project",
    "item-add",
    PROJECT_NUMBER,
    "--owner",
    PROJECT_OWNER,
    "--url",
    url,
    "--format",
    "json",
    "-q",
    ".id",
  ],

  listFields: (): string[] => [
    "project",
    "field-list",
    PROJECT_NUMBER,
    "--owner",
    PROJECT_OWNER,
    "--format",
    "json",
  ],

  projectId: (): string[] => [
    "project",
    "view",
    PROJECT_NUMBER,
    "--owner",
    PROJECT_OWNER,
    "--format",
    "json",
    "-q",
    ".id",
  ],

  setStatus: (itemId: string, projectId: string, status: StatusSelection): string[] => [
    "project",
    "item-edit",
    "--id",
    itemId,
    "--project-id",
    projectId,
    "--field-id",
    status.fieldId,
    "--single-select-option-id",
    status.optionId,
  ],
};

/** What `release-version.ts --print=json` answers. */
export type ReleasePlan = { version: string; notes: string; domains: string[] };

/**
 * That answer, checked rather than cast.
 *
 * It is JSON from a subprocess, so its shape is not something this may assume —
 * a cast here would put `undefined` into a `gh pr create --title` and open a
 * release called `release: undefined`. The same lesson as the Redis reply in
 * `rate-limit-storage.ts`, where `as [number, number]` would have refused every
 * request had the reply ever changed shape.
 *
 * Empty domains are valid: a release that touches nothing resolvable gets no
 * labels, which #357 asked for explicitly. An empty **version** is not, because
 * everything downstream is named after it.
 */
export function parseReleasePlan(payload: string): ReleasePlan | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;

  const { version, notes, domains } = value as Partial<ReleasePlan>;
  if (typeof version !== "string" || version === "") return null;
  if (typeof notes !== "string" || notes === "") return null;
  if (!Array.isArray(domains) || domains.some((d) => typeof d !== "string")) return null;

  return { version, notes, domains };
}
