/**
 * A unit test's writes to `process.stdout` and `process.stderr`, a Node warning
 * among them, go through the console, where the unit run's reporter sees them.
 *
 * decisions/847-quiet-unit-run.md
 */

const toConsole = (log: (text: string) => void) =>
  ((chunk: string | Uint8Array) => {
    log(String(chunk).replace(/\n$/, ""));
    return true;
  }) as typeof process.stdout.write;

// biome-ignore lint/suspicious/noConsole: the unit run's reporter sees console calls only
process.stdout.write = toConsole((text) => console.log(text));
// biome-ignore lint/suspicious/noConsole: the unit run's reporter sees console calls only
process.stderr.write = toConsole((text) => console.error(text));
