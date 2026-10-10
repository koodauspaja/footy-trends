/**
 * What a role is, with no database and no session: the half a client component
 * may import.
 *
 * decisions/028-admin-tools-and-roles.md
 */

/**
 * The two roles. A third is a design question, not a column change.
 *
 * decisions/028-admin-tools-and-roles.md
 */
export const ROLES = ["user", "admin"] as const;

export type Role = (typeof ROLES)[number];

/**
 * The value every row starts at, and the one an unknown string is treated as.
 *
 * decisions/028-admin-tools-and-roles.md
 */
export const DEFAULT_ROLE: Role = "user";

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

/**
 * Whether a stored value grants admin, in the one place that decides. Takes
 * `unknown`; anything that is not exactly `"admin"` is not an admin.
 *
 * decisions/028-admin-tools-and-roles.md
 */
export function isAdmin(value: unknown): boolean {
  return value === "admin";
}
