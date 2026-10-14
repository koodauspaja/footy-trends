/**
 * The end-to-end override for the analytics sign-in gate: its names and the
 * rule for when it may apply. It imports nothing but the equally import-free
 * rule for what a test database is.
 *
 * decisions/030-league-position-by-matchday.md
 * decisions/479-integration-suite-database-guard.md
 */

import { namesTestDatabase } from "./test-database-name";

/**
 * The request header an end-to-end test sends to be treated as signed in.
 *
 * decisions/030-league-position-by-matchday.md
 */
export const E2E_ANALYTICS_HEADER = "x-e2e-analytics";

/**
 * The value that header must carry.
 *
 * decisions/030-league-position-by-matchday.md
 */
export const E2E_SIGNED_IN = "signed-in";

/**
 * The server-side flag that allows that header to mean anything.
 *
 * decisions/030-league-position-by-matchday.md
 */
export const E2E_ANALYTICS_FLAG = "E2E_ANALYTICS_OVERRIDE";

/**
 * Whether this server may treat a flagged request as signed in: only with the
 * explicit flag and a `DATABASE_URL` naming a test database. Neither is
 * something a request can set.
 *
 * decisions/030-league-position-by-matchday.md
 * decisions/304-test-database.md
 */
export function e2eOverrideAllowed(env: NodeJS.Dict<string>): boolean {
  return env[E2E_ANALYTICS_FLAG] === "1" && namesTestDatabase(env.DATABASE_URL);
}
