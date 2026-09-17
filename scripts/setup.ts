/**
 * `npm run setup` — entry point and wiring. Normally reached through
 * `scripts/setup`, which checks for Node and `docker compose` and installs the
 * dependencies first (#400).
 *
 * The sequence lives in `setup-steps.ts` and the decisions in `setup-plan.ts`,
 * both unit tested; what is left here is the filesystem, the terminal and the
 * process. It stays uncovered because `void main()` at import means a test that
 * imported it would run it — and write a `.env`.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { run } from "./services-run";
import { runSetup } from "./setup-steps";

/**
 * 32 bytes as hex: as strong as `openssl rand -base64 32`, which `.env.example`
 * suggests for the auth secret, and made only of characters that need no
 * escaping in a URL or an `.env` line.
 */
function secret(): string {
  return randomBytes(32).toString("hex");
}

/** A fresh interface per question, so none is holding stdin while a child runs. */
async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  /**
   * npm, by its absolute path, rather than `npm` resolved through `PATH` — the
   * reasoning `executable.ts` gives for git and docker. npm sets this for every
   * script it runs; it is missing only when this file is run some other way.
   */
  const npmCli = process.env.npm_execpath ?? "";
  if (npmCli === "") {
    process.stderr.write("Run this with `npm run setup`, or `scripts/setup` from a fresh clone.\n");
    process.exitCode = 1;
    return;
  }

  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    packageManager?: string;
  };

  process.exitCode = await runSetup({
    readEnv: () => (existsSync(".env") ? readFileSync(".env", "utf8") : null),
    readExample: () => readFileSync(".env.example", "utf8"),
    // Owner-only when created: it holds the database password and the auth
    // secret. An existing file keeps whatever mode it had.
    writeEnv: (text) => writeFileSync(".env", text, { mode: 0o600 }),
    secret,
    interactive: process.stdin.isTTY === true,
    ask,
    userAgent: process.env.npm_config_user_agent ?? "",
    packageManager: packageJson.packageManager ?? "",
    runScript: (name) => run(process.execPath, [npmCli, "run", name]),
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  });
}

void main();
