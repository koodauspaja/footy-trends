/**
 * What `with-test-db.ts` decides before it touches a database: which command to
 * run, and which executable actually runs it.
 *
 * decisions/403-coverage-exclusions-that-earn-it.md
 */

export type Invocation =
  | { ok: true; command: string; args: string[] }
  | { ok: false; message: string };

export function usageMessage(): string {
  return "Usage: tsx scripts/with-test-db.ts <command> [args...]";
}

/**
 * The command and its arguments, from `process.argv.slice(2)`. A missing
 * command is refused, not defaulted.
 *
 * decisions/403-coverage-exclusions-that-earn-it.md
 */
export function parseInvocation(argv: readonly string[]): Invocation {
  const [command, ...args] = argv;

  if (command === undefined || command === "") return { ok: false, message: usageMessage() };

  return { ok: true, command, args };
}

/**
 * The executable to spawn for a command. `node` means this Node, so a package
 * binary runs on the runtime that started the wrapper.
 *
 * decisions/403-coverage-exclusions-that-earn-it.md
 */
export function executableFor(command: string, execPath: string): string {
  return command === "node" ? execPath : command;
}

/**
 * The exit code to report for a child that exited with `code`.
 *
 * decisions/403-coverage-exclusions-that-earn-it.md
 */
export function exitCodeFor(code: number | null): number {
  // A signalled child has no exit code. Reporting 1 keeps the failure visible
  // rather than letting it read as success — the same choice `services-run.ts`
  // makes.
  return code ?? 1;
}
