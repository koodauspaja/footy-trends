import { existsSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Vitest does not populate process.env from .env files, so the integration
// tests could not reach Postgres or Redis without exporting the variables by
// hand first. Node's built-in loader fills process.env here; test workers
// inherit it. Requires Node >= 20.12, and the project already requires 24.
/**
 * Whether the developer exported `LOG_LEVEL` for this run, captured *before*
 * `.env` is read. `process.loadEnvFile` does not override a variable that is
 * already set, so anything present now came from the shell.
 */
const logLevelWasExported = process.env.LOG_LEVEL !== undefined;

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

/**
 * `.env` must not decide how loud the tests are.
 *
 * `.env.example` sets `LOG_LEVEL=info` and the setup docs say to copy it, so
 * the logger's silent-under-test default was being overridden for anyone who
 * followed them — the suite kept printing application logs, which is the thing
 * silencing it was meant to stop. An `LOG_LEVEL=debug npm run test:unit`
 * survives, because that was exported rather than loaded from the file.
 */
if (!logLevelWasExported) {
  process.env.LOG_LEVEL = undefined;
  delete process.env.LOG_LEVEL;
}

export default defineConfig({
  plugins: [react()],
  test: {
    /**
     * **A DOM only where a test needs one.**
     *
     * `environment: "jsdom"` for everything built one for all 139 unit files
     * while only 52 of them touch a DOM, and constructing it dominated the run:
     * measured across the whole suite, `environment` accounted for ~290 s of
     * cumulative worker time against ~93 s actually running tests. The 65
     * `tests/unit/lib` files alone took 26.3 s under jsdom and 9.0 s under node,
     * with `environment` falling from 158.74 s to 7 ms and every test still
     * passing.
     *
     * The split is by extension because that is exactly where the line falls,
     * checked rather than assumed: running the whole suite under `node`, the 52
     * files that failed were **every** `.tsx` file bar `app/layout.test.tsx`,
     * and **no** `.ts` file at all. So a `.tsx` test gets a DOM and a `.ts` test
     * does not — and a new test that needs one says so by its extension, which
     * is a rule nobody has to remember.
     *
     * Both projects extend this configuration, so the setup file, the alias and
     * the plugins are shared; coverage stays here, at the root, where it is
     * gathered across both.
     */
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
          /**
           * Its own project, and not an afterthought.
           *
           * When the unit projects were the only ones, `npm run test:integration`
           * matched nothing — and `--passWithNoTests` reported that as a pass, so
           * a CI job ran zero tests and went green. Naming the suite here means a
           * configuration that cannot see it fails loudly instead.
           *
           * It keeps `.env`: unlike a unit test, it genuinely needs Postgres and
           * Redis, and `scripts/with-test-db.ts` points it at the test database.
           */
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
    /**
     * A hook may take as long as a module transform takes; a test may not.
     *
     * The two budgets are deliberately different. `testTimeout` stays at its 5 s
     * default, where it still means something: no test in this suite does five
     * seconds of legitimate work, so one that takes that long is stuck. The
     * `beforeAll` hooks added in #384 do exactly one thing — transform a
     * module graph once so no individual test is charged for it — and that was
     * measured at up to 8.4 s here, which the 10 s default leaves no margin
     * over under parallel load. Three files duly failed with
     * `Hook timed out in 10000ms`.
     *
     * 30 s is about three and a half times the measured worst. Its job is to
     * catch an import that never resolves, not to police a cost the suite
     * legitimately pays.
     */
    hookTimeout: 30_000,
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      // `json` alongside the others because `scripts/coverage-gaps.ts` reads
      // `coverage-final.json` to find source files no test imports — the files
      // vitest cannot report as 0% because it never sees them at all.
      reporter: ["lcov", "text", "json"],
      // Everything under tests/ is test code or test data, neither of which
      // is a subject of coverage. Without this a JSON fixture is reported as a
      // permanently 0%-covered file, which both adds noise and drags the
      // totals down — hiding a real regression in src/.
      //
      // Stylesheets are not executable code and have nothing to cover. Vite
      // processes `import "./globals.css"` in the root layout, so once that
      // layout gained a test the file appeared in the report as a 0/0 entry.
      exclude: ["node_modules", ".next", "vitest.config.ts", "tests/**", "**/*.css"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
