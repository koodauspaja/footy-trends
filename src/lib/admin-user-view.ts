import { isAdmin, type Role } from "@/lib/admin-role";
import { parseWholeNumber } from "./provider-ids";

/**
 * The shape the admin table renders, and the refusals it must phrase, with no
 * database import: the table is a client component.
 *
 * decisions/028-admin-tools-and-roles.md
 */

/**
 * How many users one page shows.
 *
 * decisions/028-admin-tools-and-roles.md
 */
export const USERS_PER_PAGE = 50;

/**
 * Where a page starts and how many to read, from a page number.
 *
 * decisions/028-admin-tools-and-roles.md
 */
export type PageWindow = { limit: number; offset: number };

/**
 * The page a query parameter asks for. Everything that is not a positive
 * decimal integer is page one.
 *
 * decisions/028-admin-tools-and-roles.md
 */
export function pageFrom(raw: string | string[] | undefined): number {
  const page = parseWholeNumber(raw);
  return page !== null && page >= 1 ? page : 1;
}

/**
 * How many pages a total needs. Always at least one, so "Sivu 1 / 1" is true of an empty list.
 *
 * decisions/028-admin-tools-and-roles.md
 */
export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / USERS_PER_PAGE));
}

/**
 * The window to read for a page, clamped so a page past the end shows the last one.
 *
 * decisions/028-admin-tools-and-roles.md
 */
export function windowFor(page: number, total: number): PageWindow {
  const last = pageCount(total);
  const clamped = Math.min(Math.max(1, page), last);
  return { limit: USERS_PER_PAGE, offset: (clamped - 1) * USERS_PER_PAGE };
}

/**
 * One row of the list. `createdAt` is a `Date`; the table formats it.
 *
 * decisions/028-admin-tools-and-roles.md
 */
export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
};

/**
 * Why a write was refused. Named so the UI can phrase each one differently.
 *
 * decisions/028-admin-tools-and-roles.md
 */
export type AdminRefusal = "self" | "last_admin" | "not_found" | "failed";

/**
 * What a write answers. A failure never shares a value with success.
 *
 * decisions/028-admin-tools-and-roles.md
 */
export type AdminWriteResult = { ok: true } | { ok: false; reason: AdminRefusal };

/**
 * Whether a row's role is the admin one. A re-export of `isAdmin` under a name
 * that reads correctly at the call site.
 *
 * decisions/028-admin-tools-and-roles.md
 */
export function isAdminRole(role: unknown): boolean {
  return isAdmin(role);
}
