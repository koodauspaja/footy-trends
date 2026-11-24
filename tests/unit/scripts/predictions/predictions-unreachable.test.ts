import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * `npm run predictions`, run as the process it is, against a database it cannot connect to: the
 * port belongs to a listener this file holds, which resets every connection, and the working
 * directory is empty, so no `.env` is read.
 *
 * decisions/571-bounded-database-close.md
 * decisions/883-real-clock-tests-and-the-daily-hour.md
 */

const REPOSITORY = process.cwd();
const TSX = path.join(REPOSITORY, "node_modules", "tsx", "dist", "cli.mjs");
const SCRIPT = path.join(REPOSITORY, "scripts", "predictions", "predictions.ts");
const CLOCK = path.join(REPOSITORY, "tests", "fixtures", "clock-at-noon.mjs");

let listener: Server;
let port = 0;
let directory = "";

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "predictions-test-"));
  // A reset, since the driver connects again after a plain close.
  listener = createServer((socket) => socket.resetAndDestroy());
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  port = typeof address === "object" && address !== null ? address.port : 0;
});

afterAll(async () => {
  await new Promise((resolve) => listener.close(resolve));
  rmSync(directory, { recursive: true, force: true });
});

function predictions(
  command: string
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX, SCRIPT, command], {
      cwd: directory,
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "test",
        // The `@/` paths, which tsx would otherwise look for from the empty directory.
        TSX_TSCONFIG_PATH: path.join(REPOSITORY, "tsconfig.json"),
        DATABASE_URL: `postgres://nobody:nothing@127.0.0.1:${port}/nothing`,
        // Outside the daily refresh's hour, whose paced requests would outlast the timeout.
        NODE_OPTIONS: `--import=${pathToFileURL(CLOCK).href}`,
      },
      timeout: 25_000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("the predictions script when the database resets the connection", () => {
  it.concurrent.each(["backtest", "log"])(
    "says so on stderr in one line and exits non-zero, for %s",
    async (command) => {
      const result = await predictions(command);

      // One line; the reason's wording is the operating system's.
      expect(result.stderr).toMatch(/^Predictions failed: [^\n]+\n$/);
      expect(result.stdout).toBe("");
      expect(result.code).toBe(1);
    },
    30_000
  );
});
