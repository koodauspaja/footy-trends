/**
 * Who may make the health endpoint call TASO: a request carrying the token the
 * environment holds, and nobody when it holds none.
 *
 * decisions/814-health-providers-token.md
 */

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The request header the token travels in.
 *
 * decisions/814-health-providers-token.md
 */
export const HEALTH_PROVIDERS_HEADER = "x-health-providers-token";

/**
 * The variable that holds this environment's token.
 *
 * decisions/814-health-providers-token.md
 */
export const HEALTH_PROVIDERS_TOKEN = "HEALTH_PROVIDERS_TOKEN";

/**
 * A value hashed, so the two sides of the comparison are the same length and it
 * takes the same time whatever was sent.
 *
 * decisions/814-health-providers-token.md
 */
function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Whether these headers carry the token. Unset or blank on the server, no
 * header is enough.
 *
 * decisions/814-health-providers-token.md
 */
export function providersCheckAllowed(
  headers: Headers,
  env: Record<string, string | undefined> = process.env
): boolean {
  const expected = (env[HEALTH_PROVIDERS_TOKEN] ?? "").trim();
  if (expected === "") return false;
  const sent = headers.get(HEALTH_PROVIDERS_HEADER) ?? "";
  return timingSafeEqual(digest(sent), digest(expected));
}
