/**
 * The decisions behind the pre-push e2e freshness check, kept free of the
 * filesystem, git and `docker` so they can be unit-tested directly — the same
 * split as `backfill-plan.ts` and its entry point.
 */

/** Written by the Playwright reporter, read by the pre-push hook. Gitignored. */
export const MARKER_PATH = ".e2e-freshness";

/**
 * How long a passing run stays good for on its own.
 *
 * The load-bearing check is the file comparison below — a run is stale the
 * moment the code it exercised changes. This window is the backstop for what
 * that comparison cannot see: a dependency bump, a `.env` edit, a provider
 * changing its data underneath us. Twelve hours means a morning's run does not
 * nag all morning, but yesterday's does not vouch for today.
 */
export const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** The trees whose contents a passing e2e run is taken to have exercised. */
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
 * these cannot run the suite at all, so the check must not stand between them
 * and a push — see `decideFreshness`.
 */
export function missingPrerequisites(prerequisites: Prerequisites): string[] {
  const missing: string[] = [];
  if (!prerequisites.docker) missing.push("Docker is not running (`docker compose up -d`)");
  if (!prerequisites.footballDataKey) missing.push("FOOTBALL_DATA_API_KEY is not set");
  if (!prerequisites.tasoKey) missing.push("TASO_API_KEY is not set");
  return missing;
}

/**
 * The marker records an ISO timestamp. Anything else — a truncated write, a
 * hand-edit, a file from an older format — is treated as no marker at all
 * rather than as a date, so a corrupt marker fails closed.
 */
export function parseMarker(raw: string | null): Date | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  let finishedAt: unknown;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null) return null;
    finishedAt = (parsed as Record<string, unknown>).finishedAt;
  } catch {
    return null;
  }

  if (typeof finishedAt !== "string") return null;
  const at = new Date(finishedAt);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** `3 h 5 min`, `12 min`, `40 s` — enough precision to see why it is stale. */
export function describeAge(ms: number): string {
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))} s`;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

/**
 * Whether a Playwright run covered the whole suite.
 *
 * A marker written by a filtered run would claim a freshness it did not earn,
 * which is worse than no marker: the hook would wave through a push whose
 * changes were never exercised. Both halves matter — `--grep` narrows without
 * dropping a file, and naming a spec on the command line drops files without
 * touching `grep`.
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
 * for it. A discriminated result rather than `string | null`, so that the
 * caller reaching the passing branch has the marker in hand — the alternative
 * needed a `marker === null` guard there that nothing could ever satisfy.
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
  // A marker dated ahead of now cannot record a run that has finished. Clock
  // skew or a hand-edit would otherwise sail past the staleness check below,
  // since a negative age is never greater than the window — so this fails
  // closed, the same way an unparseable marker does.
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
 * Blocks a push whose changes no passing e2e run covers — except when the
 * suite could not have been run here at all, which downgrades every block to a
 * warning. A contributor without Docker or the provider keys is not choosing to
 * skip e2e; blocking them would only teach them to pass `--no-verify` always,
 * and a gate everyone routinely bypasses stops being a gate.
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
