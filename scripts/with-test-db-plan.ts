/**
 * What `with-test-db.ts` decides before it touches a database: which command to
 * run, and which executable actually runs it.
 *
 * Split out in #403 so those decisions are tested. The runner itself creates and
 * migrates a database, which is a reason to keep it out of a unit suite that
 * survives the question — but the argument handling never needed one.
 */

export type Invocation =
  | { ok: true; command: string; args: string[] }
  | { ok: false; message: string };

export function usageMessage(): string {
  return "Usage: tsx scripts/with-test-db.ts <command> [args...]";
}

/**
 * The command and its arguments, from `process.argv.slice(2)`.
 *
 * A missing command is refused rather than defaulted: this wrapper exists to run
 * something against the test database, and "nothing" is not something.
 */
export function parseInvocation(argv: readonly string[]): Invocation {
  const [command, ...args] = argv;

  if (command === undefined || command === "") return { ok: false, message: usageMessage() };

  return { ok: true, command, args };
}

/**
 * The executable to spawn for a command.
 *
 * **`node` means *this* Node**, so a package binary runs on the runtime that
 * started the wrapper rather than whatever `PATH` finds. npm exposes those
 * binaries as `.cmd` shims on Windows, which `spawn` cannot execute without a
 * shell — the same trap `scripts/executable.ts` documents — and handing the
 * runtime an `.mjs` entry sidesteps shims and `PATH` lookup together.
 */
export function executableFor(command: string, execPath: string): string {
  return command === "node" ? execPath : command;
}

/** The exit code to report for a child that exited with `code`. */
export function exitCodeFor(code: number | null): number {
  // A signalled child has no exit code. Reporting 1 keeps the failure visible
  // rather than letting it read as success — the same choice `services-run.ts`
  // makes.
  return code ?? 1;
}
