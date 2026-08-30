/**
 * Works out the next release version from the commits going into it, so a
 * release number is derived rather than chosen — nobody has to remember
 * whether the last three weeks were a patch or a minor.
 *
 * The repository writes conventional commit subjects (`feat:`, `fix:`,
 * `chore:` …), which is what makes this possible. A subject that does not
 * parse is treated as a patch rather than ignored: an unrecognised commit
 * still changed something, and silently contributing nothing is the one
 * behaviour that would make the number wrong.
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

/** `git log` gives subject and body; a breaking change may be declared in either. */
export type Commit = { subject: string; body?: string };

function isBreaking(commit: Commit): boolean {
  const match = CONVENTIONAL.exec(commit.subject);
  if (match?.groups?.breaking) return true;
  // The footer form, which is the only way to declare one without `!`.
  return /^BREAKING[ -]CHANGE:/m.test(commit.body ?? "");
}

function typeOf(commit: Commit): string | undefined {
  return CONVENTIONAL.exec(commit.subject)?.groups?.type;
}

/**
 * `git tag --list v*` also matches things like `v1.0.0-rc.1` or `v2-old`, and
 * `parseVersion` would throw on them — taking the whole release workflow down
 * because somebody once created a tag by hand.
 */
export function isStableVersionTag(tag: string): boolean {
  return /^v?\d+\.\d+\.\d+$/.test(tag.trim());
}

/**
 * The newest stable tag that is *not* already on the commit being released.
 *
 * Ordinarily that is simply the newest tag. It matters on a rerun: if the tag
 * was pushed but publishing the release notes failed, the tag now points at
 * HEAD, and treating it as the previous tag would compute an empty range and
 * strand the release with no notes and no way to recover by rerunning. Skipping
 * it reproduces the original range, and therefore the same version.
 *
 * `tags` must be newest-first; `tagsAtHead` is whatever points at HEAD.
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
 * exclude them. `release-version.ts` passes `--no-merges`, which settles it by
 * topology; this only catches a caller that collected commits some other way.
 * Subject matching cannot be authoritative — a merge subject can be edited —
 * so it is the fallback rather than the mechanism.
 */
export function isMergeSubject(subject: string): boolean {
  return /^Merge (pull request|branch|remote-tracking branch) /.test(subject);
}

/**
 * Thrown rather than falling back, because a mistyped override must not
 * silently produce a version nobody intended.
 */
export type DecideVersionOptions = {
  /**
   * Names the first release explicitly — the one decision the commits cannot
   * make, since whether a project's first tag is 0.x or 1.0.0 is a statement
   * about stability rather than a fact about its changes.
   *
   * Applied only when `previousTag` is null — a genuine first release.
   *
   * Known limitation, accepted rather than guarded: a repository whose only
   * tags are pre-release or malformed also has no previous tag, so a stale
   * override would apply there. Guarding it needs a second definition of "has
   * this been tagged", and having two produced six rounds of contradictions
   * before they were reduced back to one. The variable is set once for a first
   * release, and a rerun never reads it, so the case needs both an unused
   * override and a tagging convention this repository does not use.
   */
  firstReleaseVersion?: string | undefined;
};

export class InvalidFirstReleaseVersion extends Error {
  constructor(value: string) {
    super(`FIRST_RELEASE_VERSION must be a version like v1.0.0, got: ${value}`);
    this.name = "InvalidFirstReleaseVersion";
  }
}

export function decideVersion(
  commits: Commit[],
  previousTag: string | null,
  options: DecideVersionOptions = {}
): VersionDecision {
  const considered = commits.filter((c) => !isMergeSubject(c.subject));

  const breaking = considered.filter(isBreaking).map((c) => c.subject);
  const features = considered
    .filter((c) => !isBreaking(c) && typeOf(c) === "feat")
    .map((c) => c.subject);
  const fixes = considered
    .filter((c) => !isBreaking(c) && typeOf(c) === "fix")
    .map((c) => c.subject);
  const other = considered
    .filter((c) => !isBreaking(c) && typeOf(c) !== "feat" && typeOf(c) !== "fix")
    .map((c) => c.subject);

  const isFirstRelease = previousTag === null;
  const previous = previousTag ?? "v0.0.0";
  const [major, minor, patch] = parseVersion(previous);
  const reasons: string[] = [];

  let bump: Bump = "patch";
  if (breaking.length > 0) {
    bump = "major";
    reasons.push(`${breaking.length} breaking change(s)`);
  } else if (features.length > 0) {
    bump = "minor";
    reasons.push(`${features.length} feat commit(s)`);
  } else {
    reasons.push(`no feat or breaking commits; ${fixes.length} fix, ${other.length} other`);
  }

  // Below 1.0.0 a breaking change moves the minor, not the major: reaching
  // 1.0.0 is a statement that the thing is stable, and that is a decision to
  // take deliberately rather than one to arrive at because a commit had a `!`.
  if (bump === "major" && major === 0) {
    bump = "minor";
    reasons.push("pre-1.0, so a breaking change moves the minor; 1.0.0 stays a deliberate call");
  }

  const nextTriple =
    bump === "major"
      ? [major + 1, 0, 0]
      : bump === "minor"
        ? [major, minor + 1, 0]
        : [major, minor, patch + 1];

  // The first release cannot be derived. `release` already holds the whole
  // history, so the commits in the promotion range describe only what happened
  // since the branch was cut — one docs commit would otherwise name the first
  // production release v0.0.1. v0.1.0 is the floor; going straight to v1.0.0 is
  // a statement about stability and stays a deliberate call.
  let next = `v${nextTriple.join(".")}`;
  if (isFirstRelease) {
    reasons.push(
      "no previous tag: first release, so the range describes only what followed the branch point"
    );
    const override = options.firstReleaseVersion?.trim();
    if (override !== undefined && override !== "") {
      if (!isStableVersionTag(override)) throw new InvalidFirstReleaseVersion(override);
      next = override.startsWith("v") ? override : `v${override}`;
      reasons.push(`named explicitly by FIRST_RELEASE_VERSION: ${next}`);
    } else {
      next = "v0.1.0";
      reasons.push("defaulting to v0.1.0; set FIRST_RELEASE_VERSION to name it deliberately");
    }
  }

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
 * One row of the release notes: the issue it came from, and a sentence.
 *
 * Both are already in the commit subject — `chore: repair the allowlist (#210)
 * (#212)` carries the reference and the description — so nothing is looked up.
 * A formatter that needed the network would fail exactly when it is used.
 */
export type ReleaseEntry = { ref: string | null; description: string };

/**
 * Splits a conventional commit subject into its issue reference and a readable
 * description.
 *
 * A squash merge appends its own `(#N)`, so a subject that already named an
 * issue ends with two references. The **first** is the issue and the last is
 * the pull request — the issue is what a reader wants, since it says why the
 * work happened rather than how it landed. A single reference means no issue
 * was named, which is what Renovate's commits look like; that one is used
 * rather than dropping the row's identity entirely.
 */
export function describeCommit(subject: string): ReleaseEntry {
  const summary = CONVENTIONAL.exec(subject)?.groups?.summary ?? subject;
  const refs = [...summary.matchAll(/\(#(\d+)\)/g)].map((match) => match[1]);
  const text = summary.replace(/\s*\(#\d+\)/g, "").trim();

  return {
    ref: refs.length === 0 ? null : `#${refs[0]}`,
    // Commit summaries start lower-case; a table cell reads as a sentence.
    description: text.charAt(0).toUpperCase() + text.slice(1),
  };
}

/**
 * A vertical bar ends a Markdown table cell, so a commit subject containing one
 * would silently split into extra columns and misalign the row. Escaping is
 * cheaper than forbidding the character in commit messages.
 */
function escapeTableCell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

/** Markdown release notes: a table per section, matching the v1.0.0 release. */
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
  // commits in the promotion range — `release` was branched from `main` and
  // already carried everything before it. Presenting that range as the release
  // contents understates it by two orders of magnitude, and does so on the one
  // release where a reader is least able to tell.
  const preamble = decision.isFirstRelease
    ? "First release: the whole application reaching production for the first time.\n\n" +
      "The commits below are **not** the contents of this release — they are only what\n" +
      "landed after `release` was branched from `main`. Everything before that branch\n" +
      "point is in this release too, and is not listed.\n\n"
    : `Changes since ${decision.previous}${describeCounts(decision)}.\n\n`;

  // A release with nothing to list would otherwise publish an empty body,
  // which reads as a mistake rather than as a deliberate no-change release.
  return `# release: ${decision.next}\n\n${preamble}${body || "No categorised commits in this range.\n"}`.trimEnd();
}

/** ` — 3 features, 6 chores`, naming only the categories that have anything. */
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
