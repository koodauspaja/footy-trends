/**
 * Whether a script was **launched**, or merely imported — the one thing that
 * lets an entry point be a tested, unexcluded source file.
 *
 * Every other runner in `scripts/` calls `main()` at import and so sits in
 * `sonar.coverage.exclusions`, because a test that imported one would run it.
 * #400 introduced this for `setup-main.ts`; #401 needed the same for
 * `verify.ts`, which is why it now lives here rather than beside the setup
 * wiring it was born in.
 */

/**
 * `process.argv[1]` is the file Node was pointed at — measured: `tsx
 * scripts/verify.ts` and `npm run verify` both give its absolute path, and under
 * vitest it is the test runner's own worker.
 *
 * Compared with forward slashes so a Windows `\` path answers the same question.
 */
export function isEntryPoint(argv: readonly string[], script: string): boolean {
  // No argv[1] at all — an embedded or `-e` invocation — answers "no", not
  // "unknown".
  const invoked = argv[1]?.replaceAll("\\", "/");
  if (invoked === undefined) return false;

  /**
   * The match has to fall on a path boundary. A bare `endsWith` accepted
   * `/tmp/not-scripts/setup-main.ts`, because that string does end with
   * `scripts/setup-main.ts` — so an unrelated file could have started setup.
   * Raised in review on #409.
   */
  return invoked === script || invoked.endsWith(`/${script}`);
}

/**
 * Starts `start` when this process is `script`, and does nothing when it is not.
 *
 * The exit code is set here rather than returned, because nothing above a
 * top-level call could do anything with it.
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
