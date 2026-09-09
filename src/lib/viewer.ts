import { headers } from "next/headers";
import { cache } from "react";
import { logger } from "@/lib/logger";
import type { Preferences } from "@/lib/regions";

const SESSION_COOKIE = "better-auth.session_token";

/**
 * Whether the request carries better-auth's session cookie.
 *
 * Compares parsed cookie **names**, not a substring of the whole header: an
 * unrelated cookie whose *value* happened to contain this string would
 * otherwise be read as an authenticated request, constructing better-auth and
 * querying preferences for a signed-out reader.
 *
 * Both spellings count — the name is prefixed `__Secure-` over HTTPS, which is
 * every production request.
 */
function hasSessionCookie(header: string | null): boolean {
  if (header === null) return false;

  return header.split(";").some((part) => {
    const trimmed = part.trim();
    const equals = trimmed.indexOf("=");

    // A fragment with no `=` is not a cookie and carries no token, so the name
    // matching on its own proves nothing. Returning here also avoids a
    // fallback for a `split` index that can never be missing.
    if (equals === -1) return false;

    const name = trimmed.slice(0, equals);
    return name === SESSION_COOKIE || name === `__Secure-${SESSION_COOKIE}`;
  });
}

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

    if (!hasSessionCookie(requestHeaders.get("cookie"))) return null;

    /**
     * Imported here, not at module scope. `auth.ts` constructs better-auth on
     * import and throws without its four environment variables — and this
     * module is reached from every competition page's context resolver, so a
     * top-level import made dozens of unrelated page tests fail in the CI unit
     * job, which deliberately has no environment at all (#158).
     *
     * Deferring it past the cookie check above also means a signed-out request
     * constructs neither the auth instance nor the database client.
     */
    const { auth } = await import("@/lib/auth");
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) return null;

    // Deferred for the same reason as `auth` above, and it was the remaining
    // hole in that claim: `preferences.ts` imports `@/db`, which constructs the
    // Postgres client at module scope. A top-level import here made every
    // importer of this module — which is every competition page — pay that on
    // a signed-out request, and fail outright without `DATABASE_URL`.
    const { getPreferencesFor } = await import("@/lib/preferences");
    return await getPreferencesFor(session.user.id);
  } catch (error) {
    logger.error({ err: error }, "Reading viewer preferences failed");
    return null;
  }
});
