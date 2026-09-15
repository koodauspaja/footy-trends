import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { testDatabaseUrl } from "./tests/support/test-database";

// This file is evaluated before `global-setup.ts`, so the variables it reads
// have to be loaded here rather than there. Playwright does not populate
// `process.env` from `.env` files, the same gap `vitest.config.ts` and
// `src/db/migrate.ts` each note.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

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

/**
 * The suite runs its own server, on its own port, against its own database
 * (#304).
 *
 * Port 3001 rather than 3000 so `npm run dev` can keep running beside it. The
 * two are now genuinely separate: development browses the development database,
 * and the suite never sees what that browsing synced.
 */
const PORT = process.env.E2E_PORT ?? "3001";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /**
   * Serial everywhere, not only in CI, and in the config rather than as a
   * `--workers=1` flag — the flag is the kind of thing that gets dropped when
   * somebody copies the command.
   *
   * Parallel runs exhaust football-data.org's rate limit and fail as
   * regressions that are not real. This was CI-only until #227, and the local
   * half was measured failing three times in one day on unrelated changes —
   * once losing five specs across four files on a change that touched a single
   * Markdown file. The correct response each time was "ignore it and re-run
   * serially", which is exactly the reflex that lets a real regression through.
   *
   * It also matters to the pre-push hook (#84), which writes its freshness
   * marker only when a full run passes: a spurious parallel failure leaves no
   * marker, so the next push is blocked and the hook looks broken.
   *
   * The cost is roughly 30s per run. That buys a suite whose failures mean
   * something — see tests/e2e/README.md.
   */
  workers: 1,
  // The HTML report is what release.yml uploads as an artifact; without it a
  // failed release run leaves nothing to look at but scrollback.
  /**
   * `e2e-freshness-reporter` records a passing full run for the pre-push hook
   * to read (#84). It is a reporter rather than an `&&` on the `test:e2e`
   * script because npm appends a script's extra arguments to the end of the
   * whole command, which would have misrouted them.
   */
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["./scripts/e2e-freshness-reporter.ts"]]
    : [["list"], ["./scripts/e2e-freshness-reporter.ts"]],
  /**
   * The browser must be more patient than the server it is waiting for.
   *
   * Playwright's default assertion timeout is 5 s, while a page render here
   * waits up to **10 s** for TASO and 8 s for football-data before giving up —
   * `RENDER_TIMEOUT_MS` in `src/lib/taso.ts` and `src/lib/football-data.ts`. So
   * whenever a provider was merely slow rather than broken, an assertion
   * expired while the server was still doing exactly what it is supposed to do,
   * and the run failed for a reason that had nothing to do with the page. That
   * is the whole of the e2e flakiness seen in #384.
   *
   * 15 s is the larger of the two render timeouts plus room for the rest of a
   * render. It is derived from that number rather than chosen for comfort: if
   * `RENDER_TIMEOUT_MS` ever rises, this has to rise with it.
   */
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
    /**
     * **Never reused, and this is load-bearing since #304.** A server already
     * listening was started by somebody else, against the *development*
     * database — so reusing it would put the suite back on whatever that
     * database happens to hold, which is the entire bug this separation fixes.
     * It also restores the older reason: reusing a `next dev` while
     * `E2E_TARGET=build` claims to test what ships would report on the dev
     * server instead.
     */
    reuseExistingServer: false,
    /**
     * The test database, not the developer's. Everything else is inherited, so
     * the provider keys and Redis URL still come from `.env`.
     */
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    timeout: 120_000,
  },
});
