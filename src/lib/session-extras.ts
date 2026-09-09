import { isRegionSegment, type RegionSegment } from "@/lib/regions";

/**
 * Reading the fields `customSession` adds to the session response, from
 * specs/024-account-settings.md and specs/025-custom-avatar.md.
 *
 * **Why a cast is needed at all.** better-auth's browser client is not typed
 * for server-side plugins, so `defaultRegion` and `avatarVersion` arrive as
 * `unknown` however the server declares them. That is worth narrowing rather
 * than asserting: a region retired from the app must not redirect anyone, and a
 * version that is not a string or is empty must not become a URL.
 *
 * **Why here rather than at each call site.** The cast was written twice
 * already — in `site-header.tsx` and `start-redirect.tsx` — and this spec adds
 * a third field-reader. Three copies of a narrowing rule is how one of them
 * ends up narrower than the others.
 *
 * No `@/db` and no `@/lib/auth`: every caller is a client component.
 */

/**
 * Every reader below takes `unknown` rather than a shape.
 *
 * better-auth's own session type declares none of these fields, so a parameter
 * typed as "an object that might have them" has no overlap with what callers
 * hold and TypeScript rejects the call outright. `unknown` says the true thing:
 * these arrive untyped, and the narrowing here is the whole job.
 */
function fieldOf(
  session: unknown,
  name: "defaultRegion" | "avatarVersion" | "favoriteTeams" | "favoriteCompetitions"
): unknown {
  if (typeof session !== "object" || session === null) return undefined;
  return (session as Record<string, unknown>)[name];
}

/** The reader's start-page preference, or null when they have none we recognise. */
export function defaultRegionOf(session: unknown): RegionSegment | null {
  const region = fieldOf(session, "defaultRegion");
  return isRegionSegment(region) ? region : null;
}

/**
 * The picture to render: the reader's own, else whatever Google gave us, else
 * null for the name.
 *
 * The version is *in* the URL rather than beside it. The image is served
 * `private, immutable` for a year on a path that is the same for every reader,
 * so the token is doing two jobs: a new upload has to be a new URL, and one
 * reader's cached picture must never be reachable at another's URL. See
 * `src/app/api/avatar/me/route.ts`.
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
 * The reader's favourite keys of one kind, from the session payload.
 *
 * **The single place anything reads favourites from the session**, which is
 * what keeps that choice reversible: specs/026 sends the whole list because it
 * rides free on a request the browser already makes, and if it measures heavy
 * at the cap, this function fetches instead and no caller changes.
 *
 * An unusable payload is an empty list rather than an error — a missing star is
 * a smaller loss than a page that will not render.
 */
export function favouriteKeysOf(session: unknown, kind: "team" | "competition"): string[] {
  const field = fieldOf(session, kind === "team" ? "favoriteTeams" : "favoriteCompetitions");
  if (!Array.isArray(field)) return [];
  return field.filter((entry): entry is string => typeof entry === "string");
}
