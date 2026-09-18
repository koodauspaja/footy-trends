import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FullConfig, FullResult, Reporter, Suite } from "@playwright/test/reporter";
import { fingerprint } from "./e2e-freshness-git";
import { isFullRun, MARKER_PATH } from "./e2e-freshness-plan";

/** Spec files on disk, so a run narrowed to one file is not mistaken for all of them. */
function availableSpecFiles(testDir: string, readdir: ReporterDeps["readdir"]): string[] {
  return readdir(testDir)
    .filter((name) => name.endsWith(".spec.ts"))
    .map((name) => path.resolve(testDir, name));
}

/**
 * The filesystem and git this reporter touches, injected so that a test can
 * drive it without a Playwright run or a marker on disk (#403).
 *
 * Playwright constructs a reporter with its configured options, and this one is
 * configured with none — so the defaults are what production uses, and the
 * parameter exists for the test.
 */
export type ReporterDeps = {
  readdir: (directory: string) => string[];
  fingerprint: () => string[] | null;
  writeMarker: (contents: string) => void;
  now: () => Date;
};

/**
 * The real filesystem and git.
 *
 * `markerPath` is a parameter so a test can exercise this wiring against a
 * throwaway file: writing the real marker would either vouch for a run that
 * never happened or destroy the record of one that did.
 */
export function reporterDeps(markerPath: string = MARKER_PATH): ReporterDeps {
  return {
    readdir: (directory) => readdirSync(directory),
    fingerprint: () => fingerprint(),
    writeMarker: (contents) => writeFileSync(markerPath, contents),
    now: () => new Date(),
  };
}

/**
 * Records that the whole e2e suite passed, for the pre-push hook to read.
 *
 * Wired into `playwright.config.ts` rather than chained onto the `test:e2e`
 * script with `&&`, because npm appends a script's extra arguments to the end
 * of the whole command — `npm run test:e2e -- --grep x` would have handed
 * `--grep x` to the marker writer instead of to Playwright.
 *
 * Nothing is written unless the run both passed and covered every spec file. A
 * marker from a filtered run would claim a freshness it did not earn, and the
 * hook would then wave through a push whose changes were never exercised.
 */
export default class E2eFreshnessReporter implements Reporter {
  private covered = false;
  private readonly deps: ReporterDeps;

  constructor(deps: Partial<ReporterDeps> = {}) {
    this.deps = { ...reporterDeps(), ...deps };
  }

  onBegin(config: FullConfig, suite: Suite): void {
    const project = config.projects[0];

    this.covered = isFullRun({
      grepSource: config.grep instanceof RegExp ? config.grep.source : ".*",
      hasGrepInvert: config.grepInvert !== null && config.grepInvert !== undefined,
      isSharded: config.shard !== null && config.shard !== undefined,
      ranFiles: [...new Set(suite.allTests().map((test) => path.resolve(test.location.file)))],
      availableFiles:
        project === undefined ? [] : availableSpecFiles(project.testDir, this.deps.readdir),
    });
  }

  onEnd(result: FullResult): void {
    if (result.status !== "passed" || !this.covered) return;

    // The marker records the *content* of the watched trees, not where git is
    // keeping it. The hook compares hashes, so committing what the run already
    // covered is invisible (#242), while a deletion still shows as an entry
    // that disappeared (#220).
    //
    // A fingerprint git cannot produce is no fingerprint: writing one that
    // cannot be checked is worse than writing none, because the hook would
    // have to trust it.
    const files = this.deps.fingerprint();
    if (files === null) return;

    this.deps.writeMarker(
      `${JSON.stringify({ finishedAt: this.deps.now().toISOString(), files })}\n`
    );
  }
}
