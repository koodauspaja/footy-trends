/**
 * Whether a script was launched, or merely imported: the one thing that lets
 * an entry point be a tested, unexcluded source file.
 *
 * decisions/400-one-command-setup.md
 * decisions/401-one-command-for-the-gate.md
 */

/**
 * Whether `process.argv[1]`, the file Node was pointed at, is `script`.
 * Compared with forward slashes, so a Windows path answers the same question.
 *
 * decisions/400-one-command-setup.md
 * decisions/401-one-command-for-the-gate.md
 */
export function isEntryPoint(argv: readonly string[], script: string): boolean {
  // No argv[1] at all — an embedded or `-e` invocation — answers "no", not
  // "unknown".
  const invoked = argv[1]?.replaceAll("\\", "/");
  if (invoked === undefined) return false;

  // The match has to fall on a path boundary: `/tmp/not-scripts/setup-main.ts`
  // also ends with `scripts/setup-main.ts`.
  return invoked === script || invoked.endsWith(`/${script}`);
}

/**
 * Starts `start` when this process is `script`, and does nothing when it is
 * not. The exit code is set here, not returned.
 *
 * decisions/400-one-command-setup.md
 * decisions/401-one-command-for-the-gate.md
 */
export function runWhenMain(
  argv: readonly string[],
  script: string,
  start: () => Promise<number>
): void {
  if (!isEntryPoint(argv, script)) return;

  void start().then((code) => {
    process.exitCode = code;
  });
}
