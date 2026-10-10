/**
 * Everything `npm run setup` needs from the outside world: the secret, the
 * prompt, the files, and whether this process was started as the setup script
 * at all. Injected and tested here; `setup-main.ts` only starts it.
 *
 * decisions/400-one-command-setup.md
 */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { run } from "./services-run";
import type { SetupActions } from "./setup-steps";
import { runSetup } from "./setup-steps";

/**
 * 32 bytes as hex: made only of characters that need no escaping in a URL or an
 * `.env` line.
 *
 * decisions/400-one-command-setup.md
 */
export function secret(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Just enough of `readline`'s interface for a prompt, so a test can stand in
 * for one.
 *
 * decisions/400-one-command-setup.md
 */
export type Prompt = {
  question: (query: string) => Promise<string>;
  close: () => void;
};

/**
 * Asks one question, and reports `null` where there is no answer to be had:
 * `question` rejects on end of input. A fresh interface per question, so none
 * holds stdin while a child process runs.
 *
 * decisions/400-one-command-setup.md
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
 * npm's own path, from the environment npm sets for the scripts it runs, not
 * `npm` resolved through `PATH`. `null` when this was started some other way.
 *
 * decisions/400-one-command-setup.md
 */
export function npmCliFrom(env: NodeJS.Dict<string>): string | null {
  const path = (env.npm_execpath ?? "").trim();
  return path === "" ? null : path;
}

export function notRunByNpmMessage(): string {
  return "Run this with `npm run setup`, or `scripts/setup` from a fresh clone.";
}

/**
 * The `packageManager` pin, or `""` when there is none, which the npm version
 * check treats as nothing to compare against.
 *
 * decisions/400-one-command-setup.md
 */
export function packageManagerFrom(packageJson: string): string {
  const parsed = JSON.parse(packageJson) as { packageManager?: string };
  return parsed.packageManager ?? "";
}

/**
 * The files setup reads and writes, relative to the repository root.
 *
 * decisions/400-one-command-setup.md
 */
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

/**
 * The real filesystem, terminal and process, as the sequence's injected actions.
 *
 * decisions/400-one-command-setup.md
 */
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
    // Owner-only, every time: it holds the database password and the auth secret.
    // The `mode` option applies only on creation, so the `chmod` covers a rerun.
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

/**
 * A readline interface, which `makeAsk` closes as soon as it has its answer.
 *
 * decisions/400-one-command-setup.md
 */
export function createNodePrompt(): Prompt {
  return createInterface({ input: process.stdin, output: process.stdout });
}

/**
 * The whole of `npm run setup`, from the real world in. Returns the exit code.
 *
 * decisions/400-one-command-setup.md
 */
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
