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
 * decisions/568-e2e-against-a-production-build.md
 * decisions/656-e2e-sends-nothing-to-sentry.md
 * decisions/672-e2e-without-the-provider.md
 * decisions/674-e2e-on-an-empty-database.md
 */

import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import {
  e2eAppPort,
  e2eRedisPort,
  e2eTarget,
  e2eTasoPort,
  serverCommand,
  startUpTimeoutMs,
  withoutSentry,
} from "./scripts/e2e-target";
import { E2E_ANALYTICS_FLAG } from "./src/lib/e2e-analytics";
import { standInDatabaseUrl, standInRedis } from "./tests/support/taso-stub";
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
 * Unset, the suite builds and runs against that production build. `build`
 * serves a build already made, which is what `release.yml` sets, and `dev` runs
 * against `next dev`.
 *
 * decisions/085-release-workflow.md
 * decisions/568-e2e-against-a-production-build.md
 */
const target = e2eTarget(process.env.E2E_TARGET);

/**
 * The suite runs its own server, on its own port, against its own database.
 * Port 3001, so `npm run dev` can keep running beside it.
 *
 * decisions/304-test-database.md
 */
const PORT = e2eAppPort(process.env);
const BASE_URL = `http://localhost:${PORT}`;

/**
 * `E2E_TASO_STUB=1` points the app at a local stand-in for TASO, for while the
 * provider refuses our requests, and at a Redis of its own. Unset, the suite
 * reaches TASO and the configured Redis as before.
 *
 * decisions/672-e2e-without-the-provider.md
 * decisions/674-e2e-on-an-empty-database.md
 */
const TASO_STUB = process.env.E2E_TASO_STUB === "1";
if (!TASO_STUB && (process.env.E2E_TASO_STUB ?? "") !== "") {
  throw new Error("E2E_TASO_STUB is 1 or unset; anything else would leave the stand-in off.");
}
// With the stand-in, a database of its own, set for the whole run as REDIS_URL
// is: global setup and the specs read it too.
if (TASO_STUB) process.env.TEST_DATABASE_URL = standInDatabaseUrl(testDatabaseUrl(), PORT);
const TASO_PORT = e2eTasoPort(process.env);
const TASO_URL = `http://localhost:${TASO_PORT}`;

/**
 * The run's own Redis while the stand-in is on, set for the whole run, not only
 * the server: the specs that drop cache keys must reach the one the server reads.
 * Workers inherit it. Read only then, so the variable cannot stop a live run.
 *
 * decisions/674-e2e-on-an-empty-database.md
 */
function redisServer() {
  const port = e2eRedisPort(process.env);
  const redis = standInRedis(port);
  process.env.REDIS_URL = redis.url;
  return {
    command: redis.command,
    // Its own word that it serves: Docker opens the port before Redis listens,
    // and refuses a port already allocated, which stops the run.
    wait: { stdout: /Ready to accept connections/ },
    reuseExistingServer: false,
    // SIGTERM, which `docker run` passes on so the container stops and is
    // removed; Playwright's default SIGKILL would leave it running.
    gracefulShutdown: { signal: "SIGTERM" as const, timeout: 10_000 },
    // Room for the first pull of the image on a machine that lacks it.
    timeout: 180_000,
  };
}

const tasoStub = {
  command: "node --import tsx tests/support/taso-stub-server.ts",
  url: TASO_URL,
  reuseExistingServer: false,
  env: { ...process.env, E2E_TASO_PORT: String(TASO_PORT) },
  timeout: 30_000,
};

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
  webServer: [
    ...(TASO_STUB ? [redisServer(), tasoStub] : []),
    {
      command: serverCommand(target, PORT),
      url: BASE_URL,
      // Never reused: a server already listening was started against the
      // development database, or is a `next dev` where a build is under test.
      reuseExistingServer: false,
      // The test database, not the developer's, and no Sentry DSN; everything else
      // is inherited. The analytics flag works only against a `_test` database,
      // which this also sets: see `src/lib/e2e-analytics.ts`.
      env: withoutSentry({
        ...process.env,
        DATABASE_URL: testDatabaseUrl(),
        ...(TASO_STUB ? { TASO_API_BASE_URL: TASO_URL } : {}),
        [E2E_ANALYTICS_FLAG]: "1",
      }),
      timeout: startUpTimeoutMs(target),
    },
  ],
});
