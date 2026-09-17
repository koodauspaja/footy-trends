/**
 * The pieces `setup.ts` wires up that are worth testing on their own: the
 * secret, the prompt, and the two things read out of the environment.
 *
 * **Why they are not in `setup.ts`.** That file calls `main()` at import, so a
 * test importing it would run setup and write the tester's `.env` — which is why
 * it is behind a coverage exclusion. Everything it holds that could be wrong
 * lives here instead, so the excluded part is the composition and nothing else.
 * Review on #409 asked why the entry point was excluded at all, and this is the
 * honest answer to it: most of it did not have to be.
 */
import { randomBytes } from "node:crypto";

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
