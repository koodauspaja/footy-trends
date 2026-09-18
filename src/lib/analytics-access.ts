import { headers } from "next/headers";
import { currentUserId } from "@/lib/current-user";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN, e2eOverrideAllowed } from "@/lib/e2e-analytics";
import { logger } from "@/lib/logger";

/**
 * Who may see analytics: **signed-in readers only.** Miikka, 2026-09-18: *"all
 * analytics are for signed in users only"* (specs/030).
 *
 * Decided on the server, before anything is computed, so a signed-out page
 * carries no analytics data at all — hiding it in the browser would publish it
 * anyway.
 *
 * A session that cannot be read counts as signed out: failing closed shows a
 * reader the sign-in prompt, where failing open would show analytics to
 * someone who is not signed in.
 *
 * The one exception is the e2e suite's, and `e2e-analytics.ts` says why it
 * cannot reach production.
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
