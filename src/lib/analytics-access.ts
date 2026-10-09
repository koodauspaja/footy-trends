import { headers } from "next/headers";
import { currentUserId } from "@/lib/current-user";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN, e2eOverrideAllowed } from "@/lib/e2e-analytics";
import { logger } from "@/lib/logger";

/**
 * Who may see analytics: signed-in readers only. Decided on the server, before
 * anything is computed; a session that cannot be read counts as signed out.
 * The e2e suite's override is the one exception.
 *
 * decisions/030-league-position-by-matchday.md
 */
export async function canSeeAnalytics(): Promise<boolean> {
  if (e2eOverrideAllowed(process.env)) {
    const requestHeaders = await headers();
    if (requestHeaders.get(E2E_ANALYTICS_HEADER) === E2E_SIGNED_IN) return true;
  }

  try {
    return (await currentUserId()) !== null;
  } catch (error) {
    logger.error({ err: error }, "Unable to read the session for analytics");
    return false;
  }
}
