import { existsSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Vitest does not populate process.env from .env files, so the integration
// tests could not reach Postgres or Redis without exporting the variables by
// hand first. Node's built-in loader fills process.env here; test workers
// inherit it. Requires Node >= 20.12, and the project already requires 24.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["lcov", "text"],
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
