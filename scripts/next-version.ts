/**
 * Works out the next release version from the commits going into it, so a
 * release number is derived, not chosen. A subject that does not parse is
 * treated as a patch, not ignored.
 *
 * decisions/085-release-workflow.md
 * decisions/217-release-notes-format.md
 * decisions/292-sonar-zero-open-issues.md
 * decisions/357-release-domains.md
 * decisions/361-release-domains-on-the-pr.md
 * decisions/471-dependency-updates-are-chores.md
 */

export type Bump = "major" | "minor" | "patch";

export type VersionDecision = {
  previous: string;
  next: string;
  bump: Bump;
  /** No prior tag: the number is a decision rather than a derivation. */
  isFirstRelease: boolean;
  /** Why, in the order the rules were applied — printed so the number is auditable. */
  reasons: string[];
  /** Subjects that drove the bump, for the release notes. */
  breaking: string[];
  features: string[];
  fixes: string[];
  other: string[];
};

const CONVENTIONAL = /^(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?:\s(?<summary>.+)$/;

/**
 * One conventional-commit subject, taken apart.
 *
 * decisions/085-release-workflow.md
 * decisions/292-sonar-zero-open-issues.md
 */
function parseSubject(subject: string): {
  type: string | undefined;
  scope: string | undefined;
  breaking: boolean;
  summary: string | undefined;
} {
  const groups = CONVENTIONAL.exec(subject)?.groups;
  return {
    type: groups?.type,
    scope: groups?.scope,
    breaking: groups?.breaking !== undefined,
    summary: groups?.summary,
  };
}

/**
 * `git log` gives subject and body; a breaking change may be declared in either.
 *
 * decisions/085-release-workflow.md
 */
export type Commit = { subject: string; body?: string };

function isBreaking(commit: Commit): boolean {
  if (parseSubject(commit.subject).breaking) return true;
  // The footer form, which is the only way to declare one without `!`.
  return /^BREAKING[ -]CHANGE:/m.test(commit.body ?? "");
}

function typeOf(commit: Commit): string | undefined {
  return parseSubject(commit.subject).type;
}

/**
 * The scope Renovate uses for a dependency update.
 *
 * decisions/471-dependency-updates-are-chores.md
 */
const DEPENDENCY_SCOPE = "deps";

/**
 * Whether a commit updates a dependency, whichever type it carries: the scope
 * decides, not the type, also for `feat(deps)`. A breaking commit is still
 * breaking.
 *
 * decisions/471-dependency-updates-are-chores.md
 */
function isDependencyUpdate(commit: Commit): boolean {
  return parseSubject(commit.subject).scope === DEPENDENCY_SCOPE;
}

/**
 * Whether a tag is a stable version. `git tag --list v*` also matches things
 * like `v1.0.0-rc.1` or `v2-old`, on which `parseVersion` would throw.
 *
 * decisions/085-release-workflow.md
 */
export function isStableVersionTag(tag: string): boolean {
  return /^v?\d+\.\d+\.\d+$/.test(tag.trim());
}

/**
 * The newest stable tag that is not already on the commit being released.
 * `tags` must be newest-first; `tagsAtHead` is whatever points at HEAD.
 *
 * decisions/085-release-workflow.md
 */
export function selectPreviousTag(tags: string[], tagsAtHead: string[]): string | null {
  const atHead = new Set(tagsAtHead);
  return tags.filter(isStableVersionTag).find((tag) => !atHead.has(tag)) ?? null;
}

export function parseVersion(tag: string): [number, number, number] {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  if (!match) throw new Error(`Not a version tag: ${tag}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * A last-resort filter for merge commits, for callers that did not ask git to
 * exclude them. Subject matching cannot be authoritative.
 *
 * decisions/085-release-workflow.md
 */
export function isMergeSubject(subject: string): boolean {
  return /^Merge (pull request|branch|remote-tracking branch) /.test(subject);
}

/**
 * Which part of the version a bump moves, and what the rest becomes.
 *
 * decisions/085-release-workflow.md
 * decisions/292-sonar-zero-open-issues.md
 */
function nextTripleFor(
  bump: "major" | "minor" | "patch",
  [major, minor, patch]: [number, number, number]
): [number, number, number] {
  if (bump === "major") return [major + 1, 0, 0];
  if (bump === "minor") return [major, minor + 1, 0];
  return [major, minor, patch + 1];
}

/**
 * What a version decision may be given beyond the commits. A mistyped override
 * throws; it never falls back.
 *
 * decisions/085-release-workflow.md
 */
export type DecideVersionOptions = {
  /**
   * Names the first release explicitly, the one decision the commits cannot
   * make. Applied only when `previousTag` is null.
   */
  firstReleaseVersion?: string | undefined;
};

export class InvalidFirstReleaseVersion extends Error {
  constructor(value: string) {
    super(`FIRST_RELEASE_VERSION must be a version like v1.0.0, got: ${value}`);
    this.name = "InvalidFirstReleaseVersion";
  }
}

/**
 * The commits that count, grouped by what they mean for the version.
 *
 * decisions/085-release-workflow.md
 * decisions/292-sonar-zero-open-issues.md
 */
function sortCommits(commits: Commit[]): {
  breaking: string[];
  features: string[];
  fixes: string[];
  other: string[];
} {
  const considered = commits.filter((c) => !isMergeSubject(c.subject));
  const subjects = (predicate: (commit: Commit) => boolean) =>
    considered.filter(predicate).map((c) => c.subject);

  return {
    breaking: subjects(isBreaking),
    features: subjects((c) => !isBreaking(c) && !isDependencyUpdate(c) && typeOf(c) === "feat"),
    fixes: subjects((c) => !isBreaking(c) && !isDependencyUpdate(c) && typeOf(c) === "fix"),
    // Everything else, which is where a dependency update lands whatever type
    // it was given — so a library's own release notes cannot move our version.
    other: subjects(
      (c) =>
        !isBreaking(c) && (isDependencyUpdate(c) || (typeOf(c) !== "feat" && typeOf(c) !== "fix"))
    ),
  };
}

/**
 * Which part moves, and the sentence explaining why. `reasons` is appended to,
 * so the explanation follows the order of the decisions.
 *
 * decisions/085-release-workflow.md
 * decisions/292-sonar-zero-open-issues.md
 */
function decideBump(
  groups: { breaking: string[]; features: string[]; fixes: string[]; other: string[] },
  major: number,
  reasons: string[]
): Bump {
  let bump: Bump = "patch";
  if (groups.breaking.length > 0) {
    bump = "major";
    reasons.push(`${groups.breaking.length} breaking change(s)`);
  } else if (groups.features.length > 0) {
    bump = "minor";
    reasons.push(`${groups.features.length} feat commit(s)`);
  } else {
    reasons.push(
      `no feat or breaking commits; ${groups.fixes.length} fix, ${groups.other.length} other`
    );
  }

  // Below 1.0.0 a breaking change moves the minor, not the major: reaching
  // 1.0.0 is a statement that the thing is stable, and that is a decision to
  // take deliberately rather than one to arrive at because a commit had a `!`.
  if (bump === "major" && major === 0) {
    reasons.push("pre-1.0, so a breaking change moves the minor; 1.0.0 stays a deliberate call");
    return "minor";
  }
  return bump;
}

/**
 * The first release's version, which cannot be derived: v0.1.0 unless an
 * override names another.
 *
 * decisions/085-release-workflow.md
 * decisions/292-sonar-zero-open-issues.md
 */
function firstReleaseVersion(override: string | undefined, reasons: string[]): string {
  reasons.push(
    "no previous tag: first release, so the range describes only what followed the branch point"
  );

  const named = override?.trim();
  if (named === undefined || named === "") {
    reasons.push("defaulting to v0.1.0; set FIRST_RELEASE_VERSION to name it deliberately");
    return "v0.1.0";
  }

  if (!isStableVersionTag(named)) throw new InvalidFirstReleaseVersion(named);
  const next = named.startsWith("v") ? named : `v${named}`;
  reasons.push(`named explicitly by FIRST_RELEASE_VERSION: ${next}`);
  return next;
}

export function decideVersion(
  commits: Commit[],
  previousTag: string | null,
  options: DecideVersionOptions = {}
): VersionDecision {
  const { breaking, features, fixes, other } = sortCommits(commits);

  const isFirstRelease = previousTag === null;
  const previous = previousTag ?? "v0.0.0";
  const [major, minor, patch] = parseVersion(previous);
  const reasons: string[] = [];

  const bump = decideBump({ breaking, features, fixes, other }, major, reasons);

  const nextTriple = nextTripleFor(bump, [major, minor, patch]);

  // The first release cannot be derived from the commits in the range.
  const next = isFirstRelease
    ? firstReleaseVersion(options.firstReleaseVersion, reasons)
    : `v${nextTriple.join(".")}`;

  return {
    previous,
    next,
    isFirstRelease,
    bump,
    reasons,
    breaking,
    features,
    fixes,
    other,
  };
}

/**
 * One row of the release notes: the issue it came from, and a sentence. Both
 * are already in the commit subject, so nothing is looked up.
 *
 * decisions/217-release-notes-format.md
 */
export type ReleaseEntry = { ref: string | null; description: string };

/**
 * Splits a conventional commit subject into its issue reference and a readable
 * description. Of two references the first is the issue and the last the
 * pull request; a single one is used as it is.
 *
 * decisions/217-release-notes-format.md
 */
export function describeCommit(subject: string): ReleaseEntry {
  const summary = parseSubject(subject).summary ?? subject;
  const refs = [...summary.matchAll(/\(#(\d+)\)/g)].map((match) => match[1]);
  // Two passes, not one `\s*\(#\d+\)`: optional whitespace in front of the
  // literal makes that pattern backtrack over a run of spaces.
  const text = summary
    .replaceAll(/\(#\d+\)/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();

  return {
    ref: refs.length === 0 ? null : `#${refs[0]}`,
    // Commit summaries start lower-case; a table cell reads as a sentence.
    description: text.charAt(0).toUpperCase() + text.slice(1),
  };
}

/**
 * Escapes a vertical bar, which ends a Markdown table cell: a subject
 * containing one would split into extra columns.
 *
 * decisions/217-release-notes-format.md
 */
function escapeTableCell(text: string): string {
  return text.replaceAll("|", String.raw`\|`);
}

/**
 * Labels that say what kind of work an issue is, not which part of the app it
 * touches. A denylist, not an allowlist.
 *
 * decisions/357-release-domains.md
 */
const KIND_LABELS = new Set([
  "enhancement",
  "chore",
  "bug",
  "documentation",
  "dependencies",
  "duplicate",
  "invalid",
  "question",
  "wontfix",
  "good first issue",
  "help wanted",
]);

/**
 * The labels on one `/issues/{n}` response, or none when it is a pull request:
 * GitHub answers that path for pull requests too.
 *
 * decisions/357-release-domains.md
 */
export function labelsOfIssueResponse(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return [];
  const record = payload as { pull_request?: unknown; labels?: unknown };
  if (record.pull_request !== undefined) return [];
  if (!Array.isArray(record.labels)) return [];

  return record.labels.flatMap((label) => {
    const name = (label as { name?: unknown }).name;
    return typeof name === "string" ? [name] : [];
  });
}

/**
 * Which parts of the app a set of issue labels names, sorted and deduplicated.
 *
 * decisions/357-release-domains.md
 */
export function domainsFrom(labels: Iterable<string>): string[] {
  return [...new Set([...labels].filter((label) => !KIND_LABELS.has(label)))].sort((a, b) =>
    a.localeCompare(b, "en")
  );
}

/**
 * Every issue a release's commits reference, in the order they first appear.
 *
 * decisions/357-release-domains.md
 */
export function issueRefsIn(decision: VersionDecision): number[] {
  const subjects = [
    ...decision.breaking,
    ...decision.features,
    ...decision.fixes,
    ...decision.other,
  ];
  const found = new Set<number>();
  for (const subject of subjects) {
    for (const match of subject.matchAll(/\(#(\d+)\)/g)) {
      const ref = Number(match[1]);
      if (Number.isSafeInteger(ref) && ref > 0) found.add(ref);
    }
  }
  return [...found];
}

/**
 * Markdown release notes: a table per section, matching the v1.0.0 release.
 *
 * decisions/217-release-notes-format.md
 */
export function formatReleaseNotes(decision: VersionDecision): string {
  const section = (title: string, subjects: string[]): string => {
    if (subjects.length === 0) return "";
    const rows = subjects
      .map(describeCommit)
      .map((entry) => `| ${entry.ref ?? ""} | ${escapeTableCell(entry.description)} |`)
      .join("\n");
    return `## ${title}\n\n| | |\n|---|---|\n${rows}\n\n`;
  };

  // Headings say what the list is. On a first release it is a tail, not a
  // changelog, and calling it "Features" would restate the very claim the
  // preamble just corrected.
  const since = decision.isFirstRelease ? " since the branch point" : "";
  // `fix:` commits are bugs, and everything that is neither `feat:` nor `fix:`
  // is a chore. "Other" described the classification rather than the work.
  const body =
    section(`Breaking changes${since}`, decision.breaking) +
    section(`Features${since}`, decision.features) +
    section(`Bugs${since}`, decision.fixes) +
    section(`Chores${since}`, decision.other);

  // A first release is the whole application reaching production, not the
  // commits in the promotion range.
  const preamble = decision.isFirstRelease
    ? "First release: the whole application reaching production for the first time.\n\n" +
      "The commits below are **not** the contents of this release — they are only what\n" +
      "landed after `release` was branched from `main`. Everything before that branch\n" +
      "point is in this release too, and is not listed.\n\n"
    : `Changes since ${decision.previous}${describeCounts(decision)}.\n\n`;

  // What the release touches is on the pull request as labels, put there by
  // `release-pr.ts`, and is not repeated here.

  // A release with nothing to list would otherwise publish an empty body,
  // which reads as a mistake rather than as a deliberate no-change release.
  return `# release: ${decision.next}\n\n${preamble}${body || "No categorised commits in this range.\n"}`.trimEnd();
}

/**
 * ` — 3 features, 6 chores`, naming only the categories that have anything.
 *
 * decisions/217-release-notes-format.md
 */
function describeCounts(decision: VersionDecision): string {
  const counts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) counts.push(`${n} ${n === 1 ? one : many}`);
  };
  add(decision.breaking.length, "breaking change", "breaking changes");
  add(decision.features.length, "feature", "features");
  add(decision.fixes.length, "bug", "bugs");
  add(decision.other.length, "chore", "chores");
  return counts.length === 0 ? "" : ` — ${counts.join(", ")}`;
}
