/**
 * Running the command-line tools a backup and a restore need, `docker` and
 * `age`: one with its output captured, or two joined by a pipe. Either fails
 * with the tool's own error output when it exits other than 0.
 *
 * decisions/807-database-backup.md
 */
import { type ChildProcessByStdio, spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";

/**
 * One command: its absolute path, its arguments and any variables added to the
 * environment.
 *
 * decisions/807-database-backup.md
 */
export type Command = {
  path: string;
  args: readonly string[];
  env?: Record<string, string>;
};

type Child = ChildProcessByStdio<Writable, Readable, Readable>;

function start(command: Command): Child {
  const child = spawn(command.path, [...command.args], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...command.env },
  });
  // A child that exits without reading its input breaks the pipe; its exit
  // code is what reports that.
  child.stdin.on("error", () => undefined);
  return child;
}

// Resolves with the exit code and the error output once the process has exited.
function finished(child: Child): Promise<{ code: number | null; stderr: string }> {
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

function failure(command: Command, code: number | null, stderr: string): Error {
  const name = command.path.split("/").at(-1);
  return new Error(`${name} exited with ${code}: ${stderr.trim()}`);
}

/**
 * Runs `command` with `input` on its standard input, and resolves with what it
 * wrote to its standard output.
 *
 * decisions/807-database-backup.md
 */
export async function capture(command: Command, input?: Uint8Array): Promise<Buffer<ArrayBuffer>> {
  const child = start(command);
  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = finished(child);
  child.stdin.end(input);
  const { code, stderr } = await done;
  if (code !== 0) throw failure(command, code, stderr);
  return Buffer.concat(chunks);
}

/**
 * Runs `first` with its standard output piped into `second`'s standard input,
 * and resolves once both have exited with 0.
 *
 * decisions/807-database-backup.md
 */
export async function pipe(first: Command, second: Command): Promise<void> {
  const writer = start(first);
  const reader = start(second);
  writer.stdin.end();
  writer.stdout.pipe(reader.stdin);
  reader.stdout.resume();
  // A reader that exits early stops taking the writer's output; draining it
  // lets the writer finish, so the reader's failure is reported, not a hang.
  reader.on("exit", () => {
    writer.stdout.unpipe(reader.stdin);
    writer.stdout.resume();
  });
  const [wrote, read] = await Promise.all([finished(writer), finished(reader)]);
  if (wrote.code !== 0) throw failure(first, wrote.code, wrote.stderr);
  if (read.code !== 0) throw failure(second, read.code, read.stderr);
}
