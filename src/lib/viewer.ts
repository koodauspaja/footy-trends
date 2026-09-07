import { headers } from "next/headers";
import { cache } from "react";
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
    // Optional-chained: a missing header and a header without the cookie are
    // the same answer here.
    if (!requestHeaders.get("cookie")?.includes("better-auth.session_token")) return null;

    /**
     * Imported here, not at module scope. `auth.ts` constructs better-auth on
     * import and throws without its four environment variables — and this
     * module is reached from every competition page's context resolver, so a
     * top-level import made dozens of unrelated page tests fail in the CI unit
     * job, which deliberately has no environment at all (#158).
     *
     * Deferring it past the cookie check above also means a signed-out request
     * never constructs the auth instance in the first place.
     */
    const { auth } = await import("@/lib/auth");
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) return null;

    return await getPreferencesFor(session.user.id);
  } catch (error) {
    logger.error({ err: error }, "Reading viewer preferences failed");
    return null;
  }
});
