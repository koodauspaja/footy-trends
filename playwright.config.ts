import { defineConfig, devices } from "@playwright/test";

// Local-only for now — not wired into CI (see .github/workflows/ci.yml and
// tests/e2e/README.md). Requires Postgres/Redis running (docker compose up
// -d) and a configured FOOTBALL_DATA_API_KEY in .env, same as npm run dev.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
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
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
