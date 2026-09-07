import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getPreferencesFor } from "@/lib/preferences";
import type { Preferences } from "@/lib/regions";

/**
 * The signed-in reader's preferences on the server, or null.
 *
 * Only reachable from pages that are already `force-dynamic`. The four pages
 * `tests/unit/app/rendering-mode.test.ts` names `STATIC_BY_DESIGN` — `/`,
 * `/kotimaa`, `/ulkomaat`, `/maajoukkueet` — must never call this: reading
 * headers there would cost them their prerender, which is the #182 constraint
 * `specs/023-google-oauth-login.md` was shaped around. The region preference is
 * applied in the browser for exactly that reason.
 *
 * **Signed-out readers pay nothing.** With no session cookie present this
 * returns before touching better-auth or Postgres, and they are the
 * overwhelming majority of traffic.
 *
 * A failure here is swallowed: preferences decide which competition a page
 * opens on, and a database blip must degrade that to the hardcoded default
 * rather than turn every standings page into an error page.
 */
export const getViewerPreferences = cache(async (): Promise<Preferences | null> => {
  try {
    const requestHeaders = await headers();

    // better-auth's cookie is prefixed `__Secure-` in production, so match on
    // the stem rather than an exact name.
    const cookie = requestHeaders.get("cookie");
    if (cookie === null || !cookie.includes("better-auth.session_token")) return null;

    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) return null;

    return await getPreferencesFor(session.user.id);
  } catch (error) {
    logger.error({ err: error }, "Reading viewer preferences failed");
    return null;
  }
});
