/**
 * A unit test's writes to `process.stdout` and `process.stderr`, a Node warning
 * among them, go through the console, where the unit run's reporter sees them.
 * The console methods are the ones present now, so a test's spy cannot hide a write.
 *
 * decisions/847-quiet-unit-run.md
 */

type Done = (error?: Error | null) => void;

const toConsole = (log: (text: string) => void) =>
  ((chunk: string | Uint8Array, encoding?: BufferEncoding | Done, callback?: Done) => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    log(text.replace(/\n$/, ""));
    const done = typeof encoding === "function" ? encoding : callback;
    if (done !== undefined) process.nextTick(done);
    return true;
  }) as typeof process.stdout.write;

const { log, error } = console;
process.stdout.write = toConsole((text) => log(text));
process.stderr.write = toConsole((text) => error(text));
