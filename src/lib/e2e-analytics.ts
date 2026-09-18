/**
 * The end-to-end override for the analytics sign-in gate — its names and the
 * rule for when it may apply, in a module that imports nothing.
 *
 * Separate from `analytics-access.ts` so the Playwright suite can import the
 * header name without pulling Next's request APIs and the auth client into a
 * test runner that has neither. One spelling, shared by the server that reads
 * the header and the tests that send it.
 */

/** The request header an end-to-end test sends to be treated as signed in. */
export const E2E_ANALYTICS_HEADER = "x-e2e-analytics";

/** The value that header must carry. */
export const E2E_SIGNED_IN = "signed-in";

/** The server-side flag that allows that header to mean anything. */
export const E2E_ANALYTICS_FLAG = "E2E_ANALYTICS_OVERRIDE";

/**
 * Whether this server may treat a flagged request as signed in.
 *
 * **Why an override exists.** The e2e suite cannot complete a real Google
 * sign-in, and its session interception (`tests/e2e/session.ts`) reaches only
 * what the *browser* renders. The analytics gate runs on the server, which sees
 * no cookie. Miikka agreed to an override for the e2e suite on 2026-09-18.
 *
 * **Why it cannot be triggered in production.** Both conditions are about the
 * server, and neither is something a request can set:
 *
 * - an explicit flag, set only in `playwright.config.ts`'s `webServer.env`;
 * - `DATABASE_URL` naming a database that ends in `_test` — the e2e server's
 *   own since #304. Production's never does.
 *
 * Only then does the per-request header count, which is what lets the same e2e
 * server show a signed-out reader the prompt: a test without the header is
 * signed out.
 */
export function e2eOverrideAllowed(env: NodeJS.Dict<string>): boolean {
  return env[E2E_ANALYTICS_FLAG] === "1" && namesTestDatabase(env.DATABASE_URL);
}

function namesTestDatabase(url: string | undefined): boolean {
  if (url === undefined) return false;

  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, "")).endsWith("_test");
  } catch {
    // Unparseable is not a test database; the override stays off.
    return false;
  }
}
