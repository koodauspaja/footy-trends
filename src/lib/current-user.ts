import { headers } from "next/headers";
import type { auth as authInstance } from "@/lib/auth";

/**
 * The server-side entry to better-auth, for every module a client component can
 * import. The import of `@/lib/auth` is dynamic, as that module throws without
 * its environment.
 *
 * decisions/026-favourites.md
 */
async function getAuthInstance(): Promise<typeof authInstance> {
  return (await import("@/lib/auth")).auth;
}

/**
 * The signed-in user's id, or null. No action takes a user id from the client.
 *
 * decisions/024-account-settings.md
 * decisions/026-favourites.md
 */
export async function currentUserId(): Promise<string | null> {
  const auth = await getAuthInstance();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/**
 * better-auth's server API, for the session-management calls that are not a
 * user id — `revokeOtherSessions` and `deleteUser` in `settings-actions.ts`.
 *
 * decisions/026-favourites.md
 */
export async function authApi(): Promise<(typeof authInstance)["api"]> {
  return (await getAuthInstance()).api;
}
