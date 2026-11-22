import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { dockerIsRunning } from "../local/docker";
import { executablePath } from "../shared/executable";
import { changedFromMain, fingerprint, type GitDeps, gitDepsIn } from "./e2e-freshness-git";
import {
  changedBetweenFingerprints,
  decideFreshness,
  describeChange,
  describeDocumentationSkip,
  isDocumentationOnly,
  MARKER_PATH,
  MAX_AGE_MS,
  missingPrerequisites,
  parseMarker,
  staleReason,
  type Verdict,
} from "./e2e-freshness-plan";

/**
 * Whether a passing full e2e run vouches for a checkout, read from its marker,
 * its working tree, its `.env` and Docker: the pre-push hook and the Claude
 * Code hook both ask this.
 *
 * decisions/084-e2e-freshness-before-push.md
 * decisions/837-e2e-before-a-pull-request-and-a-review.md
 */

/**
 * The verdict, and the reason no run vouches for the checkout when it is
 * `block`.
 *
 * decisions/837-e2e-before-a-pull-request-and-a-review.md
 */
export type Freshness = { verdict: Verdict; reason: string | null };

export type FreshnessDeps = {
  /** A file's contents, or `null` when it cannot be read. */
  readText: (path: string) => string | null;
  /** git, run in the checkout's top directory. */
  git: GitDeps;
  dockerRunning: () => boolean;
  now: () => Date;
  /** The process's own environment, which `.env` does not override. */
  env: Record<string, string | undefined>;
};

/**
 * What the last passing run cannot vouch for, as `path (kind)` strings; git
 * failing to read the tree is one such change, so the check fails closed.
 *
 * decisions/084-e2e-freshness-before-push.md
 * decisions/242-freshness-compares-content.md
 */
function changesSince(files: string[], deps: FreshnessDeps): string[] {
  const now = fingerprint(deps.git);
  if (now === null) return [describeChange("<git could not read the working tree>", "modified")];
  return changedBetweenFingerprints(files, now).map(({ path, kind }) => describeChange(path, kind));
}

/**
 * The checkout at `top` judged as the pre-push hook judges a push. `changed` is
 * what it changes from `origin/main`, or `null` when that is unknown.
 *
 * decisions/084-e2e-freshness-before-push.md
 * decisions/661-e2e-freshness-skips-documentation.md
 * decisions/837-e2e-before-a-pull-request-and-a-review.md
 */
export function checkoutFreshness(
  top: string,
  changed: string[] | null,
  deps: FreshnessDeps
): Freshness {
  if (isDocumentationOnly(changed)) {
    return {
      verdict: { kind: "pass", message: describeDocumentationSkip(changed.length) },
      reason: null,
    };
  }

  const env = { ...parseEnv(deps.readText(join(top, ".env")) ?? ""), ...deps.env };
  const marker = parseMarker(deps.readText(join(top, MARKER_PATH)));
  const input = {
    marker: marker === null ? null : marker.finishedAt,
    now: deps.now(),
    maxAgeMs: MAX_AGE_MS,
    changedFiles: marker === null ? [] : changesSince(marker.files, deps),
  };
  const verdict = decideFreshness({
    ...input,
    missingPrerequisites: missingPrerequisites({
      docker: deps.dockerRunning(),
      footballDataKey: (env.FOOTBALL_DATA_API_KEY ?? "").trim() !== "",
      tasoKey: (env.TASO_API_KEY ?? "").trim() !== "",
      tasoSigning: (env.TASO_HASH_SALT ?? "").trim() !== "" || env.E2E_TASO_STUB === "1",
    }),
  });
  return { verdict, reason: verdict.kind === "block" ? staleReason(input) : null };
}

/**
 * The checkout `directory` is in, or `null` outside one.
 *
 * decisions/837-e2e-before-a-pull-request-and-a-review.md
 */
function topOf(directory: string): string | null {
  const binary = executablePath("git");
  if (binary === null) return null;
  const result = spawnSync(binary, ["rev-parse", "--show-toplevel"], {
    cwd: directory,
    encoding: "utf8",
    timeout: 15_000,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * The real reading for the checkout at `top`.
 *
 * decisions/837-e2e-before-a-pull-request-and-a-review.md
 */
export function freshnessDeps(top: string): FreshnessDeps {
  return {
    readText,
    git: gitDepsIn(top),
    dockerRunning: dockerIsRunning,
    now: () => new Date(),
    env: process.env,
  };
}

/**
 * The checkout `directory` is in, judged with what its `HEAD` changes from
 * `origin/main`: what the Claude Code hook asks before `gh pr create` and a
 * review request. Outside a checkout no run can vouch for anything.
 *
 * decisions/837-e2e-before-a-pull-request-and-a-review.md
 */
export function freshnessOfCheckout(directory: string): Freshness {
  const top = topOf(directory);
  if (top === null) {
    return {
      verdict: { kind: "block", message: "" },
      reason: `${directory} is not in a git checkout, so no e2e run can vouch for it.`,
    };
  }
  const deps = freshnessDeps(top);
  return checkoutFreshness(top, changedFromMain(["HEAD"], deps.git), deps);
}
