"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { DEFAULT_ROLE } from "@/lib/admin-role";
import type { AdminWriteResult } from "@/lib/admin-user-view";
import { changeRole, deleteUser } from "@/lib/admin-users";

/**
 * The `"use server"` boundary for administration. `requireAdmin()` runs first
 * in every action, before the arguments are looked at, and the acting user's
 * id comes from that gate, never from the caller.
 *
 * decisions/028-admin-tools-and-roles.md
 */

/**
 * Both spellings of the page, so the list refreshes whichever URL is open.
 *
 * decisions/028-admin-tools-and-roles.md
 */
const ADMIN_PATHS = ["/yllapito", "/admin"] as const;

function revalidateAdmin(): void {
  for (const path of ADMIN_PATHS) revalidatePath(path);
}

export async function promoteUserAction(userId: string): Promise<AdminWriteResult> {
  const adminId = await requireAdmin();
  if (adminId === null) return { ok: false, reason: "failed" };

  const result = await changeRole(adminId, userId, "admin");
  if (result.ok) revalidateAdmin();
  return result;
}

export async function demoteUserAction(userId: string): Promise<AdminWriteResult> {
  const adminId = await requireAdmin();
  if (adminId === null) return { ok: false, reason: "failed" };

  const result = await changeRole(adminId, userId, DEFAULT_ROLE);
  if (result.ok) revalidateAdmin();
  return result;
}

export async function deleteUserAction(userId: string): Promise<AdminWriteResult> {
  const adminId = await requireAdmin();
  if (adminId === null) return { ok: false, reason: "failed" };

  const result = await deleteUser(adminId, userId);
  if (result.ok) revalidateAdmin();
  return result;
}
