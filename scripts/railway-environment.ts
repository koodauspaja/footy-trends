/**
 * `npm run railway:environment -- --name=<environment> [--branch=<branch>]`:
 * a new Railway environment in the linked project, from nothing to a site
 * that answers. The wiring to the CLI, the network and the clock.
 *
 * decisions/522-railway-environment-from-code.md
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { executablePath, overrideNameFor } from "./executable";
import { parseArgs } from "./railway-environment-plan";
import { type Steps, standUp } from "./railway-environment-steps";

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

const steps: Steps = {
  railway(args, { input, env } = {}) {
    const binary = executablePath("railway");
    if (binary === null) {
      throw new Error(
        `railway not found. Set ${overrideNameFor("railway")} to its absolute path if it is installed somewhere unusual.`
      );
    }
    // What the CLI prints is returned, never echoed: a failure's message is
    // the CLI's own stderr, which goes straight to the terminal.
    return execFileSync(binary, args, {
      encoding: "utf8",
      // `railway status --json` describes every environment and service: far
      // past Node's default megabyte in a project with many.
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "inherit"],
      // `_` is how the SDK finds the CLI to ask its version when it evaluates
      // a config file. A shell sets it to the command it ran; here it would
      // still name whatever started this script.
      env: { ...process.env, ...env, _: binary },
      ...(input === undefined ? {} : { input }),
    });
  },
  env: process.env,
  secret: () => randomBytes(32).toString("base64"),
  async health(url) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(20_000),
      });
      return await response.json();
    } catch {
      // Not deployed yet, or not answering JSON: both mean "ask again".
      return null;
    }
  },
  wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  out,
};

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) throw new Error(parsed.message);

  const outcome = await standUp(parsed.request, steps);
  if (!outcome.ok) throw new Error(outcome.message);
  out(outcome.message);
}

// The failure the operator sees is the reason, not a Node stack.
main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
