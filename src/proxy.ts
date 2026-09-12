import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { looksMissing, NOWHERE } from "@/lib/admin-route";

/**
 * The admin area's early 404, from specs/028-admin-tools-and-roles.md.
 *
 * `proxy.ts`, not `middleware.ts`: Next 16 renamed the convention, and the
 * build refuses the old name outright rather than warning.
 *
 * **This is not the authorisation.** `requireAdmin()` is, and it runs on the
 * page and on every server action regardless of what happens here. Deleting
 * this file would leak the existence of `/yllapito` to a stranger; it would not
 * let anyone in.
 *
 * **Why it has to exist at all.** `src/app/loading.tsx` puts every segment
 * behind a Suspense boundary, so responses stream — and Next commits the 200
 * status line before `notFound()` can be caught. Measured on a production
 * build: a missing URL answered 404 while `/yllapito` answered 200, which told
 * a signed-out stranger the route was real. Next's own documentation states the
 * behaviour ("200 for streamed responses, and 404 for non-streamed"), and its
 * recommended answer is to decide before the response streams.
 *
 * `getSessionCookie` reads the cookie only — no database, no session lookup —
 * which is what keeps this cheap enough to sit in front of a route.
 */
export function proxy(request: NextRequest): NextResponse {
  /**
   * Guarded, because this parses a header the caller controls. If it ever
   * throws, the proxy throws, and `/yllapito` answers 500 — which is both
   * broken and a louder signal than the 200 this file exists to remove.
   *
   * A failure is read as "no cookie", which refuses. That is the same direction
   * `requireAdmin()` fails in, and the cost of being wrong is that a signed-in
   * admin with an unparseable cookie sees a 404 until they sign in again.
   */
  let hasSessionCookie = false;
  try {
    hasSessionCookie = getSessionCookie(request) !== null;
  } catch {
    hasSessionCookie = false;
  }

  if (looksMissing(request.nextUrl.pathname, hasSessionCookie)) {
    // A rewrite rather than a hand-built 404, so Next produces the same
    // response it gives any missing URL: same status, same not-found page. A
    // bare `NextResponse` with status 404 would have an empty body, and a body
    // nothing else returns is itself a signal.
    return NextResponse.rewrite(new URL(NOWHERE, request.url));
  }
  return NextResponse.next();
}

/**
 * Literal paths, because Next parses this at build time and refuses anything
 * it cannot read statically — a spread of `ADMIN_PATHS` fails the build. They
 * are asserted equal to `ADMIN_PATHS` in
 * `tests/unit/lib/admin-route.test.ts`, so the duplication cannot drift
 * silently.
 */
export const config = { matcher: ["/yllapito", "/admin"] };
