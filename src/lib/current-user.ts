import { headers } from "next/headers";
import type { auth as authInstance } from "@/lib/auth";

/**
 * The server-side entry to better-auth, for every module a client component can
 * import.
 *
 * **Why the import is dynamic.** `@/lib/auth` constructs better-auth at module
 * scope, and that constructor requires `BETTER_AUTH_SECRET` and
 * `BETTER_AUTH_URL` — it throws without them. A `"use server"` module is
 * imported *by name* from client components: Next replaces it with a network
 * stub at build time, so production never evaluates this chain in a browser and
 * never noticed. Any environment without that transform does, and the CI unit
 * job has no environment at all, deliberately (#158).
 *
 * That is not hypothetical. specs/026's toggle renders inside `standings-table`
 * and the region picker, so importing the actions module statically put
 * better-auth in the import graph of eight test files that have nothing to do
 * with authentication, and 114 tests failed in CI while passing locally — where
 * a `.env` happens to exist.
 *
 * **Why it is shared.** `currentUserId` was written three times, identically, in
 * `settings-actions.ts`, `avatar-actions.ts` and `favourite-actions.ts`. Three
 * copies of the rule that no action takes a user id from its caller is how one
 * of them ends up not following it — the same reasoning that produced
 * `session-extras.ts`.
 */
async function getAuthInstance(): Promise<typeof authInstance> {
  return (await import("@/lib/auth")).auth;
}

/**
 * The signed-in user's id, or null.
 *
 * **No action takes a user id from the client.** Reading it from the session
 * here removes "do this for someone else" as a category rather than checking
 * for it, and it is one function so that it cannot be half-applied.
 */
export async function currentUserId(): Promise<string | null> {
  const auth = await getAuthInstance();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/**
 * better-auth's server API, for the session-management calls that are not a
 * user id — `revokeOtherSessions` and `deleteUser` in `settings-actions.ts`.
 */
export async function authApi(): Promise<(typeof authInstance)["api"]> {
  return (await getAuthInstance()).api;
}
