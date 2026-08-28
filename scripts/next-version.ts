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

export function parseVersion(tag: string): [number, number, number] {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  if (!match) throw new Error(`Not a version tag: ${tag}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Merge commits are excluded. A release merges `main` into `release`, so the
 * merge itself carries no type and its subject would otherwise be counted as
 * an unparseable commit and float the release to a patch on its own.
 */
export function isMergeSubject(subject: string): boolean {
  return /^Merge (pull request|branch|remote-tracking branch) /.test(subject);
}

export function decideVersion(commits: Commit[], previousTag: string | null): VersionDecision {
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
  const next = isFirstRelease ? "v0.1.0" : `v${nextTriple.join(".")}`;
  if (isFirstRelease) {
    reasons.push(
      "no previous tag: first release, so the range describes only what followed the branch point"
    );
    reasons.push(
      "defaulting to v0.1.0 rather than deriving; override deliberately if this is a 1.0"
    );
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

/** Markdown release notes, grouped the way the version was decided. */
export function formatReleaseNotes(decision: VersionDecision): string {
  const section = (title: string, items: string[]): string =>
    items.length === 0 ? "" : `## ${title}\n\n${items.map((i) => `- ${i}`).join("\n")}\n\n`;

  const body =
    section("Breaking changes", decision.breaking) +
    section("Features", decision.features) +
    section("Fixes", decision.fixes) +
    section("Other", decision.other);

  const preamble = decision.isFirstRelease
    ? "First release.\n\n"
    : `Changes since ${decision.previous}.\n\n`;

  // A release with nothing to list would otherwise publish an empty body,
  // which reads as a mistake rather than as a deliberate no-change release.
  return `${preamble}${body || "No categorised commits in this range.\n"}`.trimEnd();
}
