import { isAdmin } from "@/lib/admin-role";
import { isRegionSegment, type RegionSegment } from "@/lib/regions";

/**
 * Reading the fields `customSession` adds to the session response, narrowed
 * from `unknown`. No `@/db` and no `@/lib/auth`: every caller is a client
 * component.
 *
 * decisions/024-account-settings.md
 * decisions/025-custom-avatar.md
 * decisions/026-favourites.md
 * decisions/028-admin-tools-and-roles.md
 */

/**
 * One named field of the session, or undefined. Takes `unknown`, as every
 * reader below does: these fields arrive untyped.
 *
 * decisions/025-custom-avatar.md
 */
function fieldOf(
  session: unknown,
  name: "defaultRegion" | "avatarVersion" | "favoriteTeams" | "favoriteCompetitions" | "role"
): unknown {
  if (typeof session !== "object" || session === null) return undefined;
  return (session as Record<string, unknown>)[name];
}

/**
 * The reader's start-page preference, or null when they have none we recognise.
 *
 * decisions/024-account-settings.md
 * decisions/025-custom-avatar.md
 */
export function defaultRegionOf(session: unknown): RegionSegment | null {
  const region = fieldOf(session, "defaultRegion");
  return isRegionSegment(region) ? region : null;
}

/**
 * The picture to render: the reader's own, else whatever Google gave us, else
 * null for the name. The version is in the URL, not beside it.
 *
 * decisions/025-custom-avatar.md
 */
export function avatarSourceOf(session: unknown, googleImage: string | null): string | null {
  const version = fieldOf(session, "avatarVersion");
  // An empty or non-string version is not a version. It would still build a URL
  // the handler would answer, but with a cache key shared by everyone who had
  // one — which is the collision the random token exists to remove.
  if (typeof version === "string" && version !== "") {
    return `/api/avatar/me?v=${encodeURIComponent(version)}`;
  }
  return googleImage;
}

/**
 * The reader's favourite keys of one kind, from the session payload. The single
 * place anything reads favourites from the session. An unusable payload is an
 * empty list.
 *
 * decisions/026-favourites.md
 */
export function favouriteKeysOf(session: unknown, kind: "team" | "competition"): string[] {
  const field = fieldOf(session, kind === "team" ? "favoriteTeams" : "favoriteCompetitions");
  if (!Array.isArray(field)) return [];
  return field.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Whether to offer the reader the `Ylläpito` link. Not an authorisation, and
 * must never become one: the session's role can be stale.
 *
 * decisions/028-admin-tools-and-roles.md
 */
export function isAdminSession(session: unknown): boolean {
  return isAdmin(fieldOf(session, "role"));
}
