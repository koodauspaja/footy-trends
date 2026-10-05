import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MISSING_DATABASE_URL } from "@/db/connection-string";

/**
 * `npm run db:migrate` without `DATABASE_URL` (#536). It used to go on with
 * postgres.js's defaults, so a stray `PGHOST` in a shell decided which database
 * was migrated.
 *
 * The runner migrates as soon as it is loaded, so it is run as the process it
 * is. **It cannot reach a real database from here**, whatever it does:
 *
 * - it runs in a temporary directory holding nothing but an empty migration
 *   journal, so it finds no `.env` to load a `DATABASE_URL` from. The journal
 *   is what makes the listener mean something: without one the runner returns
 *   before its first query, and postgres.js connects only when it has one;
 * - its environment is built here from nothing but `PATH`, with every `PG*`
 *   variable pointing at a listener this file owns, which accepts a connection
 *   only to count it and hang up.
 */
const REPOSITORY = process.cwd();
const TSX = path.join(REPOSITORY, "node_modules", "tsx", "dist", "cli.mjs");
const RUNNER = path.join(REPOSITORY, "src", "db", "migrate.ts");

let listener: Server;
let port = 0;
let connections = 0;
let directory = "";

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "migrate-test-"));
  const journal = path.join(directory, "drizzle", "migrations", "meta");
  mkdirSync(journal, { recursive: true });
  writeFileSync(
    path.join(journal, "_journal.json"),
    JSON.stringify({ version: "7", dialect: "postgresql", entries: [] })
  );
  listener = createServer((socket) => {
    connections += 1;
    socket.destroy();
  });
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  port = typeof address === "object" && address !== null ? address.port : 0;
});

afterAll(async () => {
  await new Promise((resolve) => listener.close(resolve));
  rmSync(directory, { recursive: true, force: true });
});

function migrate(
  variables: Record<string, string>
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX, RUNNER], {
      cwd: directory,
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "test",
        // Where postgres.js would go if it were left to its defaults.
        PGHOST: "127.0.0.1",
        PGPORT: String(port),
        PGUSER: "nobody",
        PGDATABASE: "nothing",
        ...variables,
      },
      // A runner that did connect would wait on a server that never answers.
      timeout: 20_000,
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

describe("the migration runner without DATABASE_URL", () => {
  it.each([
    ["unset", {}],
    ["empty", { DATABASE_URL: "" }],
    ["blank", { DATABASE_URL: "   " }],
  ])(
    "exits non-zero with one line naming the variable when it is %s, and connects nowhere",
    async (_name, variables) => {
      connections = 0;

      const result = await migrate(variables);

      expect(result.stderr).toBe(`${MISSING_DATABASE_URL}\n`);
      expect(result.stdout).toBe("");
      expect(result.code).toBe(1);
      // Not `localhost`, and not the `PGHOST` it was handed.
      expect(connections).toBe(0);
    },
    30_000
  );
});
