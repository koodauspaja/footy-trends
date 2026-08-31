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
