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
      exclude: ["node_modules", ".next", "vitest.config.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
