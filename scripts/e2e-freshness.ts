/**
 * The pre-push hook's entry point: gather what the decision needs from the
 * filesystem, the environment and `docker`, then let `e2e-freshness-plan.ts`
 * decide. Exits non-zero only on a `block`.
 *
 * decisions/084-e2e-freshness-before-push.md
 * decisions/242-freshness-compares-content.md
 * decisions/661-e2e-freshness-skips-documentation.md
 */
import { existsSync, readFileSync } from "node:fs";
import { dockerIsRunning } from "./docker";
import { changedFromMain, fingerprint } from "./e2e-freshness-git";
import {
  changedBetweenFingerprints,
  decideFreshness,
  describeChange,
  describeDocumentationSkip,
  isDocumentationOnly,
  MARKER_PATH,
  MAX_AGE_MS,
  type Marker,
  missingPrerequisites,
  parseMarker,
  pushedCommits,
} from "./e2e-freshness-plan";

/**
 * What the last passing run cannot vouch for, as `path (kind)` strings: the
 * fingerprint it recorded against the working tree's now.
 *
 * decisions/084-e2e-freshness-before-push.md
 * decisions/242-freshness-compares-content.md
 */
function changesSince(marker: Marker): string[] {
  const now = fingerprint();
  if (now === null) {
    // git could not describe the working tree. Treating that as "unchanged"
    // would pass the check having verified nothing, so it fails closed.
    return [describeChange("<git could not read the working tree>", "modified")];
  }

  return changedBetweenFingerprints(marker.files, now).map(({ path: file, kind }) =>
    describeChange(file, kind)
  );
}

/**
 * Writes a line to stdout, as the backfill scripts do: `noConsole` forbids
 * `console`.
 *
 * decisions/084-e2e-freshness-before-push.md
 */
function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}
function err(line = ""): void {
  process.stderr.write(`${line}\n`);
}

function readMarker(): string | null {
  return existsSync(MARKER_PATH) ? readFileSync(MARKER_PATH, "utf8") : null;
}

/**
 * The ref lines git writes to a pre-push hook's stdin, or `null` when there
 * are none to read: run by hand from a terminal, or stdin unreadable.
 *
 * decisions/661-e2e-freshness-skips-documentation.md
 */
function readPushedRefs(): string | null {
  if (process.stdin.isTTY) return null;
  try {
    return readFileSync(0, "utf8");
  } catch {
    return null;
  }
}

/**
 * What the push changes from `origin/main`, or `null` when that cannot be
 * worked out and the full check has to run.
 *
 * decisions/661-e2e-freshness-skips-documentation.md
 */
function changedByPush(): string[] | null {
  const refs = readPushedRefs();
  if (refs === null) return null;
  const commits = pushedCommits(refs);
  return commits === null ? null : changedFromMain(commits);
}

function main(): void {
  const changed = changedByPush();
  if (isDocumentationOnly(changed)) {
    out(describeDocumentationSkip(changed.length));
    return;
  }

  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  const marker = parseMarker(readMarker());
  const verdict = decideFreshness({
    marker: marker === null ? null : marker.finishedAt,
    now: new Date(),
    maxAgeMs: MAX_AGE_MS,
    changedFiles: marker === null ? [] : changesSince(marker),
    missingPrerequisites: missingPrerequisites({
      docker: dockerIsRunning(),
      footballDataKey: (process.env.FOOTBALL_DATA_API_KEY ?? "").trim() !== "",
      tasoKey: (process.env.TASO_API_KEY ?? "").trim() !== "",
      tasoSigning:
        (process.env.TASO_HASH_SALT ?? "").trim() !== "" || process.env.E2E_TASO_STUB === "1",
    }),
  });

  if (verdict.kind === "pass") {
    out(verdict.message);
    return;
  }

  err(`\n${verdict.message}\n`);
  if (verdict.kind === "block") {
    process.exitCode = 1;
  }
}

main();
