/**
 * The decisions behind opening the release pull request, free of `gh` and the
 * network so they can be unit-tested directly.
 *
 * decisions/361-release-domains-on-the-pr.md
 */

/**
 * The board column a release pull request starts in: In Progress, not In
 * Review. Moving it to In Review is left to whoever requests the review.
 *
 * decisions/361-release-domains-on-the-pr.md
 */
export const INITIAL_STATUS = "In Progress";

/**
 * One `gh project field-list` field, as far as this needs to know it.
 *
 * decisions/361-release-domains-on-the-pr.md
 */
export type ProjectField = {
  id?: unknown;
  name?: unknown;
  options?: { id?: unknown; name?: unknown }[];
};

export type StatusSelection = { fieldId: string; optionId: string };

/**
 * The Status field and the option to start in, from what `gh` answered: read,
 * never remembered. Anything missing or misshapen answers `null`.
 *
 * decisions/361-release-domains-on-the-pr.md
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
 * not end in one. `gh pr create` prints the URL and nothing else.
 *
 * decisions/361-release-domains-on-the-pr.md
 */
export function pullNumberFrom(url: string): string | null {
  // One pattern rather than splitting and testing: `split` always returns at
  // least one element, so the fallback that shape needs is a branch no input
  // can take.
  return /\/(\d+)$/.exec(url.trim())?.[1] ?? null;
}

/**
 * The board this repository's cards live on.
 *
 * decisions/361-release-domains-on-the-pr.md
 */
export const PROJECT_NUMBER = "2";
export const PROJECT_OWNER = "koodauspaja";

/**
 * Every `gh` argument list the release needs, as data, so a test can read them.
 *
 * decisions/361-release-domains-on-the-pr.md
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
   * One request per label, and `labels[]=`, not a comma-joined string, which
   * would create a single label named after all of them.
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

/**
 * What `release-version.ts --print=json` answers.
 *
 * decisions/361-release-domains-on-the-pr.md
 */
export type ReleasePlan = { version: string; notes: string; domains: string[] };

/**
 * That answer, checked and not cast. Empty domains are valid; an empty version
 * is not, because everything downstream is named after it.
 *
 * decisions/357-release-domains.md
 * decisions/361-release-domains-on-the-pr.md
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
