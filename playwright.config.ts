/**
 * Playwright's configuration: the e2e suite, serial, against its own server
 * and the test database.
 *
 * decisions/030-league-position-by-matchday.md
 * decisions/084-e2e-freshness-before-push.md
 * decisions/085-release-workflow.md
 * decisions/227-e2e-runs-serially.md
 * decisions/304-test-database.md
 * decisions/384-a-dom-only-where-a-test-needs-one.md
 */

import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { E2E_ANALYTICS_FLAG } from "./src/lib/e2e-analytics";
import { testDatabaseUrl } from "./tests/support/test-database";

// Evaluated before `global-setup.ts`, so the variables it reads are loaded
// here: Playwright does not populate `process.env` from `.env` files.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

// Locally this needs Postgres and Redis running and both provider keys in
// `.env`. In CI it runs only from `release.yml`, never on a pull request
// targeting `main`.

/**
 * `build` runs the suite against a production build, which is what
 * `release.yml` sets. The build itself happens in the workflow.
 *
 * decisions/085-release-workflow.md
 */
const againstProductionBuild = process.env.E2E_TARGET === "build";

/**
 * The suite runs its own server, on its own port, against its own database.
 * Port 3001, so `npm run dev` can keep running beside it.
 *
 * decisions/304-test-database.md
 */
const PORT = process.env.E2E_PORT ?? "3001";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Serial everywhere, not only in CI, and in the config, not as a `--workers=1`
  // flag: parallel runs exhaust football-data.org's rate limit.
  workers: 1,
  // The HTML report is what release.yml uploads as an artifact. The freshness
  // reporter records a passing full run for the pre-push hook to read.
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["./scripts/e2e-freshness-reporter.ts"]]
    : [["list"], ["./scripts/e2e-freshness-reporter.ts"]],
  // The browser must be more patient than the server it is waiting for: the
  // larger of the two render timeouts plus 5 s. If `RENDER_TIMEOUT_MS` in
  // `src/lib/taso.ts` or `src/lib/football-data.ts` rises, this rises with it.
  expect: { timeout: Math.max(10_000, 8_000) + 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // The port is passed explicitly rather than through `PORT`, so that it
    // holds for both `next dev` and `next start` regardless of how either reads
    // its environment.
    command: againstProductionBuild ? `npm start -- -p ${PORT}` : `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    // Never reused: a server already listening was started against the
    // development database, or is a `next dev` where a build is under test.
    reuseExistingServer: false,
    // The test database, not the developer's; everything else is inherited. The
    // analytics flag works only against a `_test` database, which this also sets:
    // see `src/lib/e2e-analytics.ts`.
    env: { ...process.env, DATABASE_URL: testDatabaseUrl(), [E2E_ANALYTICS_FLAG]: "1" },
    timeout: 120_000,
  },
});
