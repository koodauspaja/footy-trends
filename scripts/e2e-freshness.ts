/**
 * The pre-push hook's entry point: gather what the decision needs from the
 * filesystem, the environment and `docker`, then let `e2e-freshness-plan.ts`
 * decide. Exits non-zero only on a `block`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  decideFreshness,
  MARKER_PATH,
  MAX_AGE_MS,
  missingPrerequisites,
  parseMarker,
  WATCHED_DIRECTORIES,
} from "./e2e-freshness-plan";

/** Every file under `directory`, recursively, as repo-relative paths. */
function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...filesUnder(full));
    } else if (entry.isFile()) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Files the last passing run cannot have covered, by modification time.
 *
 * Working-tree mtimes rather than the commits being pushed: what matters is
 * whether the code on disk is the code the suite ran against, and an uncommitted
 * edit breaks that just as thoroughly as a commit does.
 */
function changedSince(marker: Date): string[] {
  return WATCHED_DIRECTORIES.flatMap(filesUnder).filter(
    (file) => statSync(file).mtime.getTime() > marker.getTime()
  );
}

/**
 * Bounded, because a `docker` CLI installed without a reachable daemon can hang
 * far longer than anyone expects a pre-push hook to take. A timeout reads as
 * "not available", which warns rather than blocks.
 */
function dockerIsRunning(): boolean {
  const probe = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
    stdio: "ignore",
    timeout: 5000,
  });
  return probe.status === 0;
}

/** Same stdout/stderr helpers as the backfill scripts, which `noConsole` forbids. */
const out = (line = ""): void => void process.stdout.write(`${line}\n`);
const err = (line = ""): void => void process.stderr.write(`${line}\n`);

function readMarker(): string | null {
  return existsSync(MARKER_PATH) ? readFileSync(MARKER_PATH, "utf8") : null;
}

function main(): void {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  const marker = parseMarker(readMarker());
  const verdict = decideFreshness({
    marker,
    now: new Date(),
    maxAgeMs: MAX_AGE_MS,
    changedFiles: marker === null ? [] : changedSince(marker),
    missingPrerequisites: missingPrerequisites({
      docker: dockerIsRunning(),
      footballDataKey: (process.env.FOOTBALL_DATA_API_KEY ?? "").trim() !== "",
      tasoKey: (process.env.TASO_API_KEY ?? "").trim() !== "",
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
