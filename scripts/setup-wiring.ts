/**
 * Everything `npm run setup` needs from the outside world: the secret, the
 * prompt, the files, and the decision about whether this process was started as
 * the setup script at all.
 *
 * **Why none of it is in `setup-main.ts`.** A runner that calls `main()` at
 * import cannot be imported by a test — the test would run it — so this
 * repository has a row of such files behind `sonar.coverage.exclusions`. #400
 * asked not to add another. So the work lives here, where it is injected and
 * tested, and `setup-main.ts` is two lines that this module's `runWhenMain`
 * decides whether to act on. Importing it from a test does nothing at all.
 */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { run } from "./services-run";
import type { SetupActions } from "./setup-steps";
import { runSetup } from "./setup-steps";

/**
 * 32 bytes as hex: as strong as `openssl rand -base64 32`, which `.env.example`
 * suggests for the auth secret, and made only of characters that need no
 * escaping in a URL or an `.env` line.
 */
export function secret(): string {
  return randomBytes(32).toString("hex");
}

/** Just enough of `readline`'s interface for a prompt, so a test can stand in for one. */
export type Prompt = {
  question: (query: string) => Promise<string>;
  close: () => void;
};

/**
 * Asks one question, and reports `null` where there is no answer to be had.
 *
 * **`question` rejects on end of input** — `AbortError: Aborted with Ctrl+D` —
 * and an uncaught one ended setup with a stack trace where the prompt had just
 * said "press Enter to skip". Found by running it in a fresh clone, which is the
 * only place it appears: every prompt here is optional, so the honest reading of
 * "no more input" is that nothing more was chosen.
 *
 * A fresh interface per question, created by the caller, so that none is holding
 * stdin while a child process runs.
 */
export function makeAsk(create: () => Prompt): (question: string) => Promise<string | null> {
  return async (question: string) => {
    const prompt = create();
    try {
      return await prompt.question(question);
    } catch {
      return null;
    } finally {
      // Whatever happened, the interface does not keep the process alive.
      prompt.close();
    }
  };
}

/**
 * npm's own path, from the environment npm sets for the scripts it runs.
 *
 * Used instead of `npm` resolved through `PATH` — the reasoning `executable.ts`
 * gives for git and docker. `null` when this was started some other way, which
 * is a different problem from npm being missing.
 */
export function npmCliFrom(env: NodeJS.Dict<string>): string | null {
  const path = (env.npm_execpath ?? "").trim();
  return path === "" ? null : path;
}

export function notRunByNpmMessage(): string {
  return "Run this with `npm run setup`, or `scripts/setup` from a fresh clone.";
}

/**
 * The `packageManager` pin, or `""` when there is none — the npm version check
 * treats that as nothing to compare against rather than as a mismatch.
 */
export function packageManagerFrom(packageJson: string): string {
  const parsed = JSON.parse(packageJson) as { packageManager?: string };
  return parsed.packageManager ?? "";
}

/**
 * Whether this process was **launched as** `script`, rather than the module
 * merely being imported.
 *
 * `process.argv[1]` is the file Node was pointed at — measured: `tsx
 * scripts/setup-main.ts` and `npm run setup` both give its absolute path, and
 * under vitest it is the test runner's own worker. That is what lets the entry
 * point be imported by a test without running.
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

/** The files setup reads and writes, relative to the repository root. */
export const REPOSITORY_FILES = {
  env: ".env",
  example: ".env.example",
  packageJson: "package.json",
} as const;

export type NodeActions = {
  files: { env: string; example: string; packageJson: string };
  /** npm's own path, for running its scripts without going through `PATH`. */
  npmCli: string;
  env: NodeJS.Dict<string>;
  /** Whether anyone is there to answer a prompt. */
  isTty: boolean;
  createPrompt: () => Prompt;
};

/** The real filesystem, terminal and process, as the sequence's injected actions. */
export function nodeSetupActions({
  files,
  npmCli,
  env,
  isTty,
  createPrompt,
}: NodeActions): SetupActions {
  return {
    readEnv: () => (existsSync(files.env) ? readFileSync(files.env, "utf8") : null),
    readExample: () => readFileSync(files.example, "utf8"),
    /**
     * Owner-only, every time — it holds the database password and the auth
     * secret.
     *
     * **The `mode` option applies only when the file is created**, so a `.env`
     * that already existed kept whatever permissions it had while gaining
     * secrets: `cp .env.example .env` makes an 0644 file under a normal umask,
     * readable by every account on the machine. The explicit `chmod` is what
     * covers the rerun. Raised in review on #409.
     */
    writeEnv: (text) => {
      writeFileSync(files.env, text, { mode: 0o600 });
      chmodSync(files.env, 0o600);
    },
    /** The rerun case: a `.env` that needed nothing still must not be readable by others. */
    secureEnv: () => chmodSync(files.env, 0o600),
    secret,
    interactive: isTty,
    ask: makeAsk(createPrompt),
    userAgent: env.npm_config_user_agent ?? "",
    exported: env,
    packageManager: packageManagerFrom(readFileSync(files.packageJson, "utf8")),
    runScript: (name) => run(process.execPath, [npmCli, "run", name]),
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  };
}

/** A readline interface, which `makeAsk` closes as soon as it has its answer. */
export function createNodePrompt(): Prompt {
  return createInterface({ input: process.stdin, output: process.stdout });
}

/** The whole of `npm run setup`, from the real world in. Returns the exit code. */
export async function startSetup(): Promise<number> {
  const npmCli = npmCliFrom(process.env);

  if (npmCli === null) {
    process.stderr.write(`${notRunByNpmMessage()}\n`);
    return 1;
  }

  return runSetup(
    nodeSetupActions({
      files: REPOSITORY_FILES,
      npmCli,
      env: process.env,
      isTty: process.stdin.isTTY === true,
      createPrompt: createNodePrompt,
    })
  );
}
