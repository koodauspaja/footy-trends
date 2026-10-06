import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Unit tests see the environment CI gives them, not the developer's `.env`:
 * every variable `.env.example` names, bar `LOG_LEVEL`, is removed before any
 * unit test runs. A test that needs one sets it with `vi.stubEnv`.
 *
 * decisions/384-a-dom-only-where-a-test-needs-one.md
 */

const ENV_EXAMPLE = path.join(process.cwd(), ".env.example");

/**
 * `LOG_LEVEL` is the one exception, and `vitest.config.ts` owns it.
 *
 * decisions/278-quiet-test-logs.md
 * decisions/384-a-dom-only-where-a-test-needs-one.md
 */
const OWNED_ELSEWHERE = new Set(["LOG_LEVEL"]);

const documented = readFileSync(ENV_EXAMPLE, "utf8")
  .split("\n")
  .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
  .filter((name): name is string => name !== undefined && !OWNED_ELSEWHERE.has(name));

if (documented.length === 0) {
  // A silently empty list would leave every test depending on `.env` again,
  // which is the failure this file exists to prevent.
  throw new Error(`No variables parsed from ${ENV_EXAMPLE}; the unit suite would not match CI.`);
}

for (const name of documented) {
  delete process.env[name];
}
