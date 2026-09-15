/**
 * What a role *is*, with **no database and no session** — the half a client
 * component may import, from specs/028-admin-tools-and-roles.md.
 *
 * The exclusion is the same one at the top of `favourite-keys.ts`,
 * `regions.ts` and `avatar-limits.ts`, and it is load-bearing for the same
 * reason: the account menu decides whether to render the `Ylläpito` link, and
 * the account menu is in the browser bundle. Importing `admin-guard.ts` there
 * would pull the database in with it.
 */

/** The two roles. A third is a design question, not a column change. */
export const ROLES = ["user", "admin"] as const;

export type Role = (typeof ROLES)[number];

/** The value every row starts at, and the one an unknown string is treated as. */
export const DEFAULT_ROLE: Role = "user";

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

/**
 * Whether a stored value grants admin, in the one place that decides.
 *
 * Takes `unknown` rather than `Role` deliberately. The value arrives from a
 * database column typed `text` and from session payloads the client cannot
 * vouch for, so the check that it is a role at all belongs here rather than at
 * each call site — where one of them would eventually skip it.
 *
 * Anything that is not exactly `"admin"` is not an admin: an unknown string, a
 * different case, `null`, `undefined`, a number. The failure direction matters
 * more here than anywhere else in the app, so it is closed by construction
 * rather than by enumerating what to reject.
 */
export function isAdmin(value: unknown): boolean {
  return value === "admin";
}
