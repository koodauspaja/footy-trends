/**
 * `npm run setup` — the composition, and nothing else. Normally reached through
 * `scripts/setup`, which checks for Node and `docker compose` and installs the
 * dependencies first (#400).
 *
 * The decisions live in `setup-plan.ts`, the sequence in `setup-steps.ts` and
 * the pieces wired up below in `setup-wiring.ts` — all three unit tested. What
 * is left here is which real function goes where, and it stays uncovered
 * because `void main()` at import means a test that imported it would run
 * setup and write the tester's `.env`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { run } from "./services-run";
import { runSetup } from "./setup-steps";
import {
  makeAsk,
  notRunByNpmMessage,
  npmCliFrom,
  packageManagerFrom,
  secret,
} from "./setup-wiring";

async function main(): Promise<void> {
  const npmCli = npmCliFrom(process.env);
  if (npmCli === null) {
    process.stderr.write(`${notRunByNpmMessage()}\n`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = await runSetup({
    readEnv: () => (existsSync(".env") ? readFileSync(".env", "utf8") : null),
    readExample: () => readFileSync(".env.example", "utf8"),
    // Owner-only when created: it holds the database password and the auth
    // secret. An existing file keeps whatever mode it had.
    writeEnv: (text) => writeFileSync(".env", text, { mode: 0o600 }),
    secret,
    interactive: process.stdin.isTTY === true,
    ask: makeAsk(() => createInterface({ input: process.stdin, output: process.stdout })),
    userAgent: process.env.npm_config_user_agent ?? "",
    packageManager: packageManagerFrom(readFileSync("package.json", "utf8")),
    runScript: (name) => run(process.execPath, [npmCli, "run", name]),
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  });
}

void main();
