import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type Command, capture, pipe } from "../../../../scripts/backup/processes";

/**
 * Running a tool and joining two with a pipe, with Node itself as the tool, so
 * the processes are real and harmless.
 *
 * decisions/807-database-backup.md
 */

function node(code: string, env: Record<string, string> = {}): Command {
  return { path: process.execPath, args: ["-e", code], env };
}

let directory = "";
afterEach(() => {
  if (directory !== "") rmSync(directory, { recursive: true, force: true });
  directory = "";
});

describe("capture", () => {
  it("returns what the tool wrote, given its input and its added variables", async () => {
    const echo = node(
      "process.stdin.on('data', (d) => process.stdout.write(process.env.PREFIX + d))",
      { PREFIX: "got " }
    );

    await expect(capture(echo, Buffer.from("input")).then(String)).resolves.toBe("got input");
  });

  it("runs a tool that reads no input", async () => {
    await expect(capture(node("process.stdout.write('done')")).then(String)).resolves.toBe("done");
  });

  it("fails with the tool's name, exit code and error output", async () => {
    const failing = node("process.stderr.write('no such table\\n'); process.exit(3)");

    await expect(capture(failing)).rejects.toThrow(/exited with 3: no such table$/);
  });

  it("fails when the tool cannot be started at all", async () => {
    await expect(capture({ path: "/nonexistent/tool", args: [] })).rejects.toThrow("ENOENT");
  });
});

describe("pipe", () => {
  it("feeds the first tool's output to the second", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "pipe-test-"));
    const target = path.join(directory, "out.txt");

    await pipe(
      node("process.stdout.write('dumped')"),
      node(
        `let all = ''; process.stdin.on('data', (d) => { all += d });
         process.stdin.on('end', () => require('node:fs').writeFileSync(${JSON.stringify(target)}, all.toUpperCase()))`
      )
    );

    expect(readFileSync(target, "utf8")).toBe("DUMPED");
  });

  it("fails when the first tool fails, even though the second succeeds", async () => {
    await expect(
      pipe(
        node("process.stderr.write('dump failed'); process.exit(1)"),
        node("process.stdin.resume()")
      )
    ).rejects.toThrow(/exited with 1: dump failed$/);
  });

  it("fails when the second tool fails", async () => {
    await expect(
      pipe(
        node("process.stdout.write('x')"),
        node("process.stderr.write('bad key'); process.exit(2)")
      )
    ).rejects.toThrow(/exited with 2: bad key$/);
  });
});
