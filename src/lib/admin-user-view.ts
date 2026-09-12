import { isAdmin, type Role } from "@/lib/admin-role";

/**
 * The shape the admin table renders, and the refusals it must phrase — with
 * **no database import**, from specs/028-admin-tools-and-roles.md.
 *
 * The same boundary as `favourite-keys.ts` and `avatar-limits.ts`, and needed
 * for the same reason: `admin-users.ts` opens `@/db`, and the table is a client
 * component. Keeping the type and the refusal vocabulary here means the browser
 * bundle never reaches the query layer to learn what a row looks like.
 */

/** One row of the list. `createdAt` is a `Date`; the table formats it. */
export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
};

/** Why a write was refused. Named so the UI can phrase each one differently. */
export type AdminRefusal = "self" | "last_admin" | "not_found" | "failed";

/** What a write answers. A failure never shares a value with success. */
export type AdminWriteResult = { ok: true } | { ok: false; reason: AdminRefusal };

/**
 * Whether a row's role is the admin one.
 *
 * A re-export under a name that reads correctly at the call site — `isAdmin(entry.role)`
 * would invite being read as "is this entry an admin object". Same function,
 * same closed-by-construction behaviour.
 */
export function isAdminRole(role: unknown): boolean {
  return isAdmin(role);
}
