/**
 * The pre-push hook's entry point: gather what the decision needs from the
 * filesystem, the environment and `docker`, then let `e2e-freshness-plan.ts`
 * decide. Exits non-zero only on a `block`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { changedBetweenCommits, currentHead, currentStatus } from "./e2e-freshness-git";
import {
  type ChangeKind,
  changedBetweenStatuses,
  decideFreshness,
  describeChange,
  kindFromDiffLetter,
  MARKER_PATH,
  MAX_AGE_MS,
  type Marker,
  missingPrerequisites,
  parseMarker,
} from "./e2e-freshness-plan";

/**
 * What the last passing run cannot vouch for, as `path (kind)` strings.
 *
 * Two sources, because they catch different things. Commits between the marker
 * and `HEAD` cover work that has landed — including **deletions**, which the
 * modification-time walk this replaced could not see at all, since a deleted
 * file leaves nothing to stat (#220). Working-tree status covers what has not
 * been committed yet, because an uncommitted edit breaks the correspondence
 * just as thoroughly as a commit does.
 *
 * A `touch` with no content change now counts as nothing, which is the right
 * answer and was not the old one.
 */
function changesSince(marker: Marker): string[] {
  const head = currentHead();
  const changes = new Map<string, ChangeKind>();

  if (head === null) {
    // No resolvable HEAD: nothing can be compared, so nothing is vouched for.
    return [describeChange("<git HEAD unavailable>", "changed")];
  }

  const landed = changedBetweenCommits(marker.head, head);
  if (landed === null) {
    // The recorded commit is gone — a rebase or force-push. Fail closed.
    return [describeChange(`<history changed since ${marker.head.slice(0, 7)}>`, "changed")];
  }
  for (const line of landed) {
    const [letter, ...rest] = line.split("\t");
    const file = rest.at(-1);
    if (file !== undefined) changes.set(file, kindFromDiffLetter(letter ?? ""));
  }

  for (const { path: file, kind } of changedBetweenStatuses(marker.status, currentStatus())) {
    changes.set(file, kind);
  }

  return [...changes]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, kind]) => describeChange(file, kind));
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
    marker: marker === null ? null : marker.finishedAt,
    now: new Date(),
    maxAgeMs: MAX_AGE_MS,
    changedFiles: marker === null ? [] : changesSince(marker),
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
