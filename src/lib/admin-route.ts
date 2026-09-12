/**
 * Which requests the middleware answers as missing, from
 * specs/028-admin-tools-and-roles.md — with **no framework imports**, so the
 * decision can be unit tested without a request object.
 */

/** Both spellings of the admin area. The English one only ever redirects. */
export const ADMIN_PATHS = ["/yllapito", "/admin"] as const;

/**
 * A path that is not a route, and is not meant to become one.
 *
 * The middleware rewrites to it rather than returning a bare 404, so the
 * response is produced by Next exactly as any missing URL is: same status, same
 * not-found page, same headers. A hand-built 404 would have an empty body,
 * which is a different response from the app's — and a different response is a
 * signal, which is the whole thing this is trying not to give.
 */
export const NOWHERE = "/_not-a-route";

/**
 * Whether this request should be answered as if the route did not exist.
 *
 * **Not an authorisation.** It only knows whether a session cookie is present,
 * never who holds it or what role they have — `requireAdmin()` does that
 * against the database and is what actually refuses. This exists for one
 * narrower reason: Next commits a 200 status before `notFound()` can be caught
 * whenever the response streams, so a signed-out stranger could tell
 * `/yllapito` apart from a missing URL by its status alone. Deciding before
 * anything streams is the only way to close that.
 *
 * A request that carries a session cookie falls through to the page, which
 * refuses it properly. The cookie is not checked for validity here: forging one
 * buys nothing but the 200 that everyone signed in already gets.
 */
export function looksMissing(pathname: string, hasSessionCookie: boolean): boolean {
  return !hasSessionCookie && (ADMIN_PATHS as readonly string[]).includes(pathname);
}
