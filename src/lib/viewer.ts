import { headers } from "next/headers";
import { cache } from "react";
import { logger } from "@/lib/logger";
import type { Preferences } from "@/lib/regions";

const SESSION_COOKIE = "better-auth.session_token";

/**
 * Whether the request carries better-auth's session cookie. Compares parsed
 * cookie names, not a substring of the header. Both spellings count: the name
 * is prefixed `__Secure-` over HTTPS.
 *
 * decisions/024-account-settings.md
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
 * The signed-in reader's preferences on the server, or null. Only for pages
 * that are already `force-dynamic`: the four prerendered pages must never call
 * it. A failure is logged and answers null.
 *
 * decisions/023-google-oauth-login.md
 * decisions/024-account-settings.md
 */
export const getViewerPreferences = cache(async (): Promise<Preferences | null> => {
  try {
    const requestHeaders = await headers();

    if (!hasSessionCookie(requestHeaders.get("cookie"))) return null;

    // Imported here, not at module scope: `auth.ts` constructs better-auth on
    // import and throws without its environment variables, and this module is
    // reached from every competition page's context resolver.
    const { auth } = await import("@/lib/auth");
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) return null;

    // Deferred like `auth` above, so a signed-out request, which is every
    // competition page's, loads neither it nor the database module behind it.
    const { getPreferencesFor } = await import("@/lib/preferences");
    return await getPreferencesFor(session.user.id);
  } catch (error) {
    logger.error({ err: error }, "Reading viewer preferences failed");
    return null;
  }
});
