import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `"use server"` boundary for administration, from
 * specs/028-admin-tools-and-roles.md.
 *
 * The gate is the point of these. A server action is a public endpoint whether
 * or not anything renders a control for it, so neither the hidden menu link nor
 * the page's 404 keeps a caller out — and the tests that matter most assert
 * that a refused caller performed **no write**, not merely that it was told no.
 */
const { requireAdmin, changeRole, deleteUser, revalidatePath } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  changeRole: vi.fn(),
  deleteUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({ requireAdmin }));
vi.mock("@/lib/admin-users", () => ({ changeRole, deleteUser }));
vi.mock("next/cache", () => ({ revalidatePath }));

beforeEach(() => {
  requireAdmin.mockReset();
  changeRole.mockReset();
  deleteUser.mockReset();
  revalidatePath.mockReset();
  requireAdmin.mockResolvedValue("admin-1");
  changeRole.mockResolvedValue({ ok: true });
  deleteUser.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("every admin action refuses a caller that is not an admin", () => {
  it.each([
    ["promoteUserAction", "promoteUserAction"],
    ["demoteUserAction", "demoteUserAction"],
    ["deleteUserAction", "deleteUserAction"],
  ])("%s writes nothing when the gate refuses", async (_name, exported) => {
    requireAdmin.mockResolvedValue(null);
    const actions = await import("@/lib/admin-actions");
    const action = actions[exported as keyof typeof actions] as (id: string) => Promise<unknown>;

    await expect(action("victim")).resolves.toEqual({ ok: false, reason: "failed" });
    // The assertion that matters: refused means nothing happened, not that
    // something happened and was reported as a failure.
    expect(changeRole).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("promoteUserAction", () => {
  it("passes the acting admin from the gate, never from the caller", async () => {
    const { promoteUserAction } = await import("@/lib/admin-actions");

    await promoteUserAction("target-9");

    // "do this as someone else" is removed as a category rather than checked
    // for: the id comes from the session via the gate.
    expect(changeRole).toHaveBeenCalledWith("admin-1", "target-9", "admin");
  });

  it("revalidates both spellings of the page on success", async () => {
    const { promoteUserAction } = await import("@/lib/admin-actions");

    await promoteUserAction("target-9");

    expect(revalidatePath).toHaveBeenCalledWith("/yllapito");
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("does not revalidate when the write was refused", async () => {
    changeRole.mockResolvedValue({ ok: false, reason: "self" });
    const { promoteUserAction } = await import("@/lib/admin-actions");

    await expect(promoteUserAction("me")).resolves.toEqual({ ok: false, reason: "self" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("demoteUserAction", () => {
  it("asks for the reader role, not for the admin one", async () => {
    const { demoteUserAction } = await import("@/lib/admin-actions");

    await demoteUserAction("target-9");

    expect(changeRole).toHaveBeenCalledWith("admin-1", "target-9", "user");
  });

  it("passes a last-admin refusal back unchanged", async () => {
    changeRole.mockResolvedValue({ ok: false, reason: "last_admin" });
    const { demoteUserAction } = await import("@/lib/admin-actions");

    await expect(demoteUserAction("target-9")).resolves.toEqual({
      ok: false,
      reason: "last_admin",
    });
  });
});

describe("deleteUserAction", () => {
  it("deletes the target as the acting admin", async () => {
    const { deleteUserAction } = await import("@/lib/admin-actions");

    await deleteUserAction("target-9");

    expect(deleteUser).toHaveBeenCalledWith("admin-1", "target-9");
  });

  it("passes a not_found refusal back unchanged", async () => {
    deleteUser.mockResolvedValue({ ok: false, reason: "not_found" });
    const { deleteUserAction } = await import("@/lib/admin-actions");

    await expect(deleteUserAction("gone")).resolves.toEqual({ ok: false, reason: "not_found" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
