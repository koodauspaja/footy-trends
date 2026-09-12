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

/**
 * How many users one page shows.
 *
 * Replaced a hard cap of 500. The cap kept the render bounded but made the
 * oldest accounts unreachable once it was hit, and a notice saying so only made
 * that visible rather than fixing it. Fifty is a screenful with scrolling and
 * keeps the query small; the number is a judgement, not a measurement, and
 * changing it changes nothing else.
 */
export const USERS_PER_PAGE = 50;

/** Where a page starts and how many to read, from a page number. */
export type PageWindow = { limit: number; offset: number };

/**
 * The page a query parameter asks for, clamped to something real.
 *
 * The parameter is attacker-controlled and arrives as a string, so everything
 * that is not a positive decimal integer is page one: `"0"`, `"-3"`, `"2abc"`,
 * `"1e3"`, an array from a repeated parameter, `undefined`. `Number()` alone
 * would accept several of those — `Number("0x10")` is 16 — which is the parser
 * class `skills/self-review.md` names.
 */
export function pageFrom(raw: string | string[] | undefined): number {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

/** How many pages a total needs. Always at least one, so "Sivu 1 / 1" is true of an empty list. */
export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / USERS_PER_PAGE));
}

/** The window to read for a page, clamped so a page past the end shows the last one. */
export function windowFor(page: number, total: number): PageWindow {
  const last = pageCount(total);
  const clamped = Math.min(Math.max(1, page), last);
  return { limit: USERS_PER_PAGE, offset: (clamped - 1) * USERS_PER_PAGE };
}

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
