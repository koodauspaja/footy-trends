import { isRegionSegment, type RegionSegment } from "@/lib/regions";

/**
 * Reading the fields `customSession` adds to the session response, from
 * specs/024-account-settings.md and specs/025-custom-avatar.md.
 *
 * **Why a cast is needed at all.** better-auth's browser client is not typed
 * for server-side plugins, so `defaultRegion` and `avatarVersion` arrive as
 * `unknown` however the server declares them. That is worth narrowing rather
 * than asserting: a region retired from the app must not redirect anyone, and a
 * version that is not a number must not become a URL.
 *
 * **Why here rather than at each call site.** The cast was written twice
 * already — in `site-header.tsx` and `start-redirect.tsx` — and this spec adds
 * a third field-reader. Three copies of a narrowing rule is how one of them
 * ends up narrower than the others.
 *
 * No `@/db` and no `@/lib/auth`: every caller is a client component.
 */

/**
 * `unknown`, not a shape.
 *
 * better-auth's own session type declares none of these fields, so a parameter
 * typed as "an object that might have them" has no overlap with what callers
 * hold and TypeScript rejects the call outright. `unknown` says the true thing:
 * these arrive untyped, and the narrowing below is the whole job.
 */
type SessionLike = unknown;

function fieldOf(session: SessionLike, name: "defaultRegion" | "avatarVersion"): unknown {
  if (typeof session !== "object" || session === null) return undefined;
  return (session as Record<string, unknown>)[name];
}

/** The reader's start-page preference, or null when they have none we recognise. */
export function defaultRegionOf(session: SessionLike): RegionSegment | null {
  const region = fieldOf(session, "defaultRegion");
  return isRegionSegment(region) ? region : null;
}

/**
 * The picture to render: the reader's own, else whatever Google gave us, else
 * null for the name.
 *
 * The version is *in* the URL rather than beside it. The image is served
 * `immutable` for a year, so a new upload has to be a new URL or the browser
 * keeps showing the old one — see `src/app/api/avatar/me/route.ts`.
 */
export function avatarSourceOf(session: SessionLike, googleImage: string | null): string | null {
  const version = fieldOf(session, "avatarVersion");
  // A non-finite or non-positive version is not a version. It would still build
  // a URL that the handler would answer, but it would be a cache key nothing
  // could invalidate.
  if (typeof version === "number" && Number.isFinite(version) && version > 0) {
    return `/api/avatar/me?v=${version}`;
  }
  return googleImage;
}
