import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FullConfig, FullResult, Reporter, Suite } from "@playwright/test/reporter";
import { isFullRun, MARKER_PATH } from "./e2e-freshness-plan";

/** Spec files on disk, so a run narrowed to one file is not mistaken for all of them. */
function availableSpecFiles(testDir: string): string[] {
  return readdirSync(testDir)
    .filter((name) => name.endsWith(".spec.ts"))
    .map((name) => path.resolve(testDir, name));
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

  onBegin(config: FullConfig, suite: Suite): void {
    const project = config.projects[0];

    this.covered = isFullRun({
      grepSource: config.grep instanceof RegExp ? config.grep.source : ".*",
      hasGrepInvert: config.grepInvert !== null && config.grepInvert !== undefined,
      isSharded: config.shard !== null && config.shard !== undefined,
      ranFiles: [...new Set(suite.allTests().map((test) => path.resolve(test.location.file)))],
      availableFiles: project === undefined ? [] : availableSpecFiles(project.testDir),
    });
  }

  onEnd(result: FullResult): void {
    if (result.status !== "passed" || !this.covered) return;
    writeFileSync(MARKER_PATH, `${JSON.stringify({ finishedAt: new Date().toISOString() })}\n`);
  }
}
