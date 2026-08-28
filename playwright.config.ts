import { defineConfig, devices } from "@playwright/test";

// Locally: requires Postgres/Redis running (docker compose up -d) and a
// configured FOOTBALL_DATA_API_KEY and TASO_API_KEY in .env, same as npm run
// dev. In CI this runs only from .github/workflows/release.yml — on pull
// requests targeting `release` and on pushes to it, never on a pull request
// targeting `main`, per #81.

/**
 * `build` runs the suite against a production build, which is what
 * `release.yml` sets: a release gate should exercise what ships, not the dev
 * server. The build itself happens in the workflow, because `webServer` runs a
 * single command under a start-up timeout a full build would blow through.
 */
const againstProductionBuild = process.env.E2E_TARGET === "build";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /**
   * Serial in CI, in the config rather than as a `--workers=1` flag on the
   * command line — the flag is the kind of thing that gets dropped when
   * somebody copies the command. Parallel runs exhaust football-data.org's
   * rate limit and fail as regressions that are not real.
   *
   * Spread rather than `workers: undefined`, because `exactOptionalPropertyTypes`
   * rejects an explicit undefined and the local default is Playwright's to pick.
   */
  ...(process.env.CI ? { workers: 1 } : {}),
  // The HTML report is what release.yml uploads as an artifact; without it a
  // failed release run leaves nothing to look at but scrollback.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: againstProductionBuild ? "npm start" : "npm run dev",
    url: "http://localhost:3000",
    // Never reuse when the point is to test a production build: a `next dev`
    // already on port 3000 would be silently accepted, and the run would
    // report on the dev server while claiming to test what ships. That is the
    // failure mode `E2E_TARGET=build` exists to avoid.
    reuseExistingServer: !process.env.CI && !againstProductionBuild,
    timeout: 120_000,
  },
});
