/**
 * The decisions behind the pre-push e2e freshness check, free of the
 * filesystem, git and `docker` so they can be unit-tested directly.
 *
 * decisions/084-e2e-freshness-before-push.md
 * decisions/220-freshness-notices-deletions.md
 * decisions/242-freshness-compares-content.md
 * decisions/292-sonar-zero-open-issues.md
 */

/**
 * Written by the Playwright reporter, read by the pre-push hook. Gitignored.
 *
 * decisions/084-e2e-freshness-before-push.md
 */
export const MARKER_PATH = ".e2e-freshness";

/**
 * How long a passing run stays good for on its own: the backstop for what the
 * file comparison cannot see.
 *
 * decisions/084-e2e-freshness-before-push.md
 */
export const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * The trees whose contents a passing e2e run is taken to have exercised.
 *
 * decisions/084-e2e-freshness-before-push.md
 */
export const WATCHED_DIRECTORIES = ["src", "tests/e2e"];

export const RUN_COMMAND = "npm run test:e2e";
export const ESCAPE_HATCH = "git push --no-verify";

export type Prerequisites = {
  docker: boolean;
  footballDataKey: boolean;
  tasoKey: boolean;
};

export type Verdict = {
  /** `block` is the only one that fails the push. */
  kind: "pass" | "warn" | "block";
  message: string;
};

/**
 * Names what e2e needs locally and does not have. A contributor missing any of
 * these cannot run the suite at all: see `decideFreshness`.
 *
 * decisions/084-e2e-freshness-before-push.md
 */
export function missingPrerequisites(prerequisites: Prerequisites): string[] {
  const missing: string[] = [];
  if (!prerequisites.docker) missing.push("Docker is not running (`docker compose up -d`)");
  if (!prerequisites.footballDataKey) missing.push("FOOTBALL_DATA_API_KEY is not set");
  if (!prerequisites.tasoKey) missing.push("TASO_API_KEY is not set");
  return missing;
}

/**
 * What a passing run recorded: when it finished, and the content of the watched
 * trees at that moment. Content, not where git keeps it.
 *
 * decisions/084-e2e-freshness-before-push.md
 * decisions/242-freshness-compares-content.md
 */
export type Marker = {
  finishedAt: Date;
  /** `hash<TAB>path` for every watched file that existed, sorted. */
  files: string[];
};

/**
 * Reads a marker. Anything that is not a complete one (a truncated write, a
 * hand-edit, an older format) is treated as no marker at all.
 *
 * decisions/084-e2e-freshness-before-push.md
 * decisions/220-freshness-notices-deletions.md
 */
export function parseMarker(raw: string | null): Marker | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { finishedAt, files } = parsed as Record<string, unknown>;
  if (typeof finishedAt !== "string") return null;
  if (!Array.isArray(files) || files.some((line) => typeof line !== "string")) return null;

  const at = new Date(finishedAt);
  if (Number.isNaN(at.getTime())) return null;

  return { finishedAt: at, files: files as string[] };
}

/**
 * How a watched path differs from what the last passing run covered.
 *
 * decisions/220-freshness-notices-deletions.md
 */
export type ChangeKind = "added" | "modified" | "deleted";

/**
 * Names the kind in the blocking message, so a deletion is not mistaken for an
 * edit.
 *
 * decisions/220-freshness-notices-deletions.md
 */
export function describeChange(path: string, kind: ChangeKind): string {
  return `${path} (${kind})`;
}

/**
 * The path in a `hash<TAB>path` entry.
 *
 * decisions/242-freshness-compares-content.md
 */
export function pathFromEntry(entry: string): string {
  return entry.slice(entry.indexOf("\t") + 1);
}

/**
 * The hash in a `hash<TAB>path` entry.
 *
 * decisions/242-freshness-compares-content.md
 */
export function hashFromEntry(entry: string): string {
  return entry.slice(0, entry.indexOf("\t"));
}

/**
 * What changed between two fingerprints: a path present in one and not the
 * other, or one whose hash differs.
 *
 * decisions/220-freshness-notices-deletions.md
 * decisions/242-freshness-compares-content.md
 */
export function changedBetweenFingerprints(
  before: string[],
  after: string[]
): { path: string; kind: ChangeKind }[] {
  const was = new Map(before.map((entry) => [pathFromEntry(entry), hashFromEntry(entry)]));
  const now = new Map(after.map((entry) => [pathFromEntry(entry), hashFromEntry(entry)]));

  const changed: { path: string; kind: ChangeKind }[] = [];
  for (const [path, hash] of now) {
    const previous = was.get(path);
    if (previous === undefined) changed.push({ path, kind: "added" });
    else if (previous !== hash) changed.push({ path, kind: "modified" });
  }
  for (const [path] of was) {
    if (!now.has(path)) changed.push({ path, kind: "deleted" });
  }
  return changed.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * `3 h 5 min`, `12 min`, `40 s`: enough precision to see why it is stale.
 *
 * decisions/084-e2e-freshness-before-push.md
 */
export function describeAge(ms: number): string {
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))} s`;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

/**
 * Whether a Playwright run covered the whole suite: no `--grep`, and no spec
 * named on the command line.
 *
 * decisions/084-e2e-freshness-before-push.md
 */
export function isFullRun(run: {
  /** `config.grep.source`; Playwright's default is `.*`. */
  grepSource: string;
  hasGrepInvert: boolean;
  isSharded: boolean;
  /** Spec files Playwright will actually run. */
  ranFiles: string[];
  /** Spec files present on disk. */
  availableFiles: string[];
}): boolean {
  if (run.grepSource !== ".*" || run.hasGrepInvert || run.isSharded) return false;
  if (run.availableFiles.length === 0) return false;
  const ran = new Set(run.ranFiles);
  return run.availableFiles.every((file) => ran.has(file));
}

/**
 * Either the single reason the push should stop, or the marker that vouches
 * for it.
 *
 * decisions/084-e2e-freshness-before-push.md
 */
type Assessment = { blocking: string } | { vouchedBy: Date };

function assess(input: {
  marker: Date | null;
  now: Date;
  maxAgeMs: number;
  changedFiles: string[];
}): Assessment {
  if (input.marker === null) {
    return {
      blocking: "No passing full e2e run has been recorded, so nothing vouches for these changes.",
    };
  }

  const age = input.now.getTime() - input.marker.getTime();
  // A marker dated ahead of now cannot record a run that has finished, so it
  // fails closed, as an unparseable marker does: a negative age would
  // otherwise pass the staleness check below.
  if (age < 0) {
    return {
      blocking: `The marker is dated ${describeAge(-age)} in the future, so no completed run stands behind it. Delete ${MARKER_PATH} and run the suite again.`,
    };
  }

  if (age > input.maxAgeMs) {
    return {
      blocking: `The last passing e2e run finished ${describeAge(age)} ago, beyond the ${describeAge(
        input.maxAgeMs
      )} freshness window.`,
    };
  }

  if (input.changedFiles.length > 0) {
    const shown = input.changedFiles.slice(0, 5).join(", ");
    const rest = input.changedFiles.length > 5 ? ` (+${input.changedFiles.length - 5} more)` : "";
    return {
      blocking: `${input.changedFiles.length} file(s) changed since the last passing e2e run: ${shown}${rest}.`,
    };
  }

  return { vouchedBy: input.marker };
}

/**
 * Blocks a push whose changes no passing e2e run covers, except when the suite
 * could not have been run here at all, which downgrades every block to a
 * warning.
 *
 * decisions/084-e2e-freshness-before-push.md
 */
export function decideFreshness(input: {
  marker: Date | null;
  now: Date;
  maxAgeMs: number;
  changedFiles: string[];
  missingPrerequisites: string[];
}): Verdict {
  const assessment = assess(input);

  if ("vouchedBy" in assessment) {
    const age = describeAge(input.now.getTime() - assessment.vouchedBy.getTime());
    return { kind: "pass", message: `e2e is fresh (last run ${age} ago).` };
  }

  const blocking = assessment.blocking;

  if (input.missingPrerequisites.length > 0) {
    const missing = input.missingPrerequisites.map((reason) => `  - ${reason}`).join("\n");
    return {
      kind: "warn",
      message: [
        `Warning: ${blocking}`,
        "",
        "Not blocking the push, because e2e cannot run here:",
        missing,
        "",
        `Set those up and run \`${RUN_COMMAND}\` when you can.`,
      ].join("\n"),
    };
  }

  return {
    kind: "block",
    message: [
      `Push blocked: ${blocking}`,
      "",
      `Run \`${RUN_COMMAND}\` and push again.`,
      `To push anyway, use \`${ESCAPE_HATCH}\`.`,
    ].join("\n"),
  };
}

/**
 * The fingerprint's entries in a fixed order, so the same working tree always
 * produces the same list. By code unit: not `entries.sort()`, and not
 * `localeCompare`, which depends on the machine.
 *
 * decisions/242-freshness-compares-content.md
 * decisions/292-sonar-zero-open-issues.md
 */
export function inFixedOrder(entries: string[]): string[] {
  return [...entries].sort((left, right) => {
    if (left < right) return -1;
    return left > right ? 1 : 0;
  });
}
