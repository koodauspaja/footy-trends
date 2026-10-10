/**
 * Vitest's configuration: two unit projects, split by whether a test needs a
 * DOM, and the integration project.
 *
 * decisions/002-season-selector-and-backfill.md
 * decisions/009-veikkausliiga.md
 * decisions/017-huuhkajat.md
 * decisions/278-quiet-test-logs.md
 * decisions/384-a-dom-only-where-a-test-needs-one.md
 * decisions/400-one-command-setup.md
 * decisions/467-deterministic-integration-suite.md
 * decisions/479-integration-suite-database-guard.md
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { parseSonarProperty } from "./scripts/coverage-gaps-plan";

// Vitest does not populate process.env from .env files, so Node's built-in
// loader fills it here; test workers inherit it.
/**
 * Whether the developer exported `LOG_LEVEL` for this run, captured before
 * `.env` is read: anything present now came from the shell.
 *
 * decisions/278-quiet-test-logs.md
 */
const logLevelWasExported = process.env.LOG_LEVEL !== undefined;

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

// `.env` must not decide how loud the tests are. An exported `LOG_LEVEL`
// survives; one loaded from the file does not.
if (!logLevelWasExported) {
  process.env.LOG_LEVEL = undefined;
  delete process.env.LOG_LEVEL;
}

export default defineConfig({
  plugins: [react()],
  test: {
    // A DOM only where a test needs one: a `.tsx` test gets jsdom and a `.ts` test
    // does not. Both projects extend this configuration; coverage stays at the
    // root, where it is gathered across both.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["./vitest.setup.ts", "./tests/support/unit-env.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "unit-dom",
          environment: "jsdom",
          include: ["tests/unit/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts", "./tests/support/unit-env.ts"],
        },
      },
      {
        extends: true,
        test: {
          // Its own project, so a configuration that cannot see the suite fails loudly.
          // It keeps `.env`: it needs Postgres and Redis.
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["./vitest.setup.ts"],
          // Refuses to run against anything but a test database, also when started
          // without `with-test-db.ts`.
          globalSetup: ["./tests/support/integration-database-guard.ts"],
          // One file at a time, because they share one database.
          fileParallelism: false,
        },
      },
    ],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      // `json` alongside the others because `scripts/coverage-gaps.ts` reads
      // `coverage-final.json` to find source files no test imports — the files
      // vitest cannot report as 0% because it never sees them at all.
      reporter: ["lcov", "text", "json"],
      // The run fails below 100% on any of the four: nothing else catches an
      // uncovered statement, function or line in a file some test imports.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
      // Everything under tests/ is test code or data, and stylesheets are not
      // executable. Plus whatever Sonar says it does not score, read from Sonar's
      // own file, the one `scripts/coverage-gaps.ts` reads.
      exclude: [
        "node_modules",
        ".next",
        "vitest.config.ts",
        "tests/**",
        "**/*.css",
        ...parseSonarProperty(
          readFileSync("sonar-project.properties", "utf8"),
          "sonar.coverage.exclusions"
        ),
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
