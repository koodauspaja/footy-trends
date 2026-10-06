import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FullConfig, FullResult, Reporter, Suite } from "@playwright/test/reporter";
import { fingerprint } from "./e2e-freshness-git";
import { isFullRun, MARKER_PATH } from "./e2e-freshness-plan";

/**
 * Spec files on disk, so a run narrowed to one file is not mistaken for all of
 * them.
 *
 * decisions/084-e2e-freshness-before-push.md
 */
function availableSpecFiles(testDir: string, readdir: ReporterDeps["readdir"]): string[] {
  return readdir(testDir)
    .filter((name) => name.endsWith(".spec.ts"))
    .map((name) => path.resolve(testDir, name));
}

/**
 * The filesystem and git this reporter touches, injected so that a test can
 * drive it without a Playwright run or a marker on disk.
 *
 * decisions/403-coverage-exclusions-that-earn-it.md
 */
export type ReporterDeps = {
  readdir: (directory: string) => string[];
  fingerprint: () => string[] | null;
  writeMarker: (contents: string) => void;
  now: () => Date;
};

/**
 * The real filesystem and git. `markerPath` is a parameter so a test can use a
 * throwaway file.
 *
 * decisions/403-coverage-exclusions-that-earn-it.md
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
 * Nothing is written unless the run both passed and covered every spec file.
 *
 * decisions/084-e2e-freshness-before-push.md
 * decisions/242-freshness-compares-content.md
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

    // The marker records the content of the watched trees, not where git keeps it.
    // A fingerprint git cannot produce is no fingerprint, so nothing is written.
    const files = this.deps.fingerprint();
    if (files === null) return;

    this.deps.writeMarker(
      `${JSON.stringify({ finishedAt: this.deps.now().toISOString(), files })}\n`
    );
  }
}
