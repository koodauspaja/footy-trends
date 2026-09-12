import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The admin route itself, from specs/028-admin-tools-and-roles.md.
 *
 * Without this file the page has no test, which vitest scores as 100% — it
 * only measures files a test imports — while Sonar correctly reports 0%. The
 * same reason `tests/unit/app/settings/page.test.tsx` exists, and the trap this
 * component nearly shipped in.
 */
const { requireAdmin, listUsers, notFound, logger } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listUsers: vi.fn(),
  notFound: vi.fn(() => {
    // Next's `notFound` throws a control-flow signal; nothing after it runs.
    throw new Error("NEXT_NOT_FOUND");
  }),
  logger: { error: vi.fn() },
}));

vi.mock("@/lib/admin-guard", () => ({ requireAdmin }));
vi.mock("@/lib/admin-users", () => ({ listUsers }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/logger", () => ({ logger }));
// The table is a client component with its own tests; this file is about the
// route's gate and what it hands over.
vi.mock("@/components/admin-user-table", () => ({
  AdminUserTable: ({
    currentAdminId,
    users,
    page,
    pages,
  }: {
    currentAdminId: string;
    users: unknown[];
    page: number;
    pages: number;
  }) => (
    <div
      data-admin={currentAdminId}
      data-count={users.length}
      data-page={page}
      data-pages={pages}
      data-testid="table"
    />
  ),
}));

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue("admin-1");
  listUsers
    .mockReset()
    .mockResolvedValue({ users: [{ id: "u1" }, { id: "u2" }], page: 1, pages: 1, total: 2 });
  notFound.mockClear();
  logger.error.mockClear();
});

describe("the admin page", () => {
  it("renders the list for an admin, and tells the table who is acting", async () => {
    const Admin = (await import("@/app/admin/page")).default;

    render(await Admin({ searchParams: Promise.resolve({}) }));

    const table = screen.getByTestId("table");
    expect(table).toHaveAttribute("data-admin", "admin-1");
    expect(table).toHaveAttribute("data-count", "2");
  });

  it("answers not-found when the gate refuses, without reading any users", async () => {
    requireAdmin.mockResolvedValue(null);
    const Admin = (await import("@/app/admin/page")).default;

    await expect(Admin({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    // The assertion that matters: a caller who may not see the answer never
    // causes the query that produces it.
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("lets a failed read surface rather than rendering an empty list", async () => {
    // "Ei käyttäjiä." from a database error would tell an admin the app has no
    // users, which is a claim we cannot make from a failure.
    listUsers.mockRejectedValue(new Error("database down"));
    const Admin = (await import("@/app/admin/page")).default;

    await expect(Admin({ searchParams: Promise.resolve({}) })).rejects.toThrow("database down");
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), adminId: "admin-1" }),
      "Reading the user list failed"
    );
  });

  it("asks for the page the URL names", async () => {
    const Admin = (await import("@/app/admin/page")).default;

    await Admin({ searchParams: Promise.resolve({ sivu: "3" }) });

    expect(listUsers).toHaveBeenCalledWith(3);
  });

  it.each([
    ["a value that is not a number", "abc"],
    ["zero", "0"],
    ["a negative", "-2"],
    ["a repeated parameter", ["2", "5"]],
  ])("falls back to page one for %s", async (_case, sivu) => {
    // The parameter is attacker-controlled and arrives as a string; anything
    // that is not a positive decimal integer is page one.
    const Admin = (await import("@/app/admin/page")).default;

    await Admin({ searchParams: Promise.resolve({ sivu }) });

    expect(listUsers).toHaveBeenCalledWith(1);
  });
});
