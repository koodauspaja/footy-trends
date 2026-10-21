/**
 * The UX sweep's screenshots: the e2e suite's server, stand-in and test
 * database, run from `tests/ux` with the list reporter alone, so a run never
 * records the e2e freshness marker.
 *
 * decisions/695-ux-sweep.md
 */

import { defineConfig } from "@playwright/test";
import e2e from "./playwright.config";

export default defineConfig({
  ...e2e,
  testDir: "./tests/ux",
  reporter: [["list"]],
  // One test walks every page, in eight views each.
  timeout: 20 * 60_000,
});
