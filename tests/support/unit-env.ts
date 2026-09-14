import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Unit tests see the environment CI gives them, not the developer's `.env`.
 *
 * `vitest.config.ts` loads `.env` so the integration suite can reach Postgres
 * and Redis, and that file is unavoidably in scope for the unit suite too. A
 * unit test that reads a variable from it passes on a laptop and fails on a
 * runner, where nothing sets it. Not hypothetical: a `beforeAll` added in #384
 * imported `@/lib/auth`, which refuses to construct without
 * `BETTER_AUTH_SECRET`. It passed here and skipped twenty tests in CI.
 *
 * So every variable the project documents is removed before any unit test runs.
 * A test that needs one sets it with `vi.stubEnv`, which is explicit and
 * behaves the same in both places.
 *
 * **The list is read from `.env.example` rather than written out here.** A copy
 * would drift the moment somebody adds a variable, and it would drift silently
 * — in the direction that lets a test depend on a laptop again.
 */
const ENV_EXAMPLE = path.join(process.cwd(), ".env.example");

/**
 * `LOG_LEVEL` is the one exception, and `vitest.config.ts` owns it: it deletes
 * the value `.env` supplies while keeping one the developer exported, so
 * `LOG_LEVEL=debug npm run test:unit` still works. Removing it here would take
 * that away for no gain, since CI sets it no more than it sets the rest.
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
