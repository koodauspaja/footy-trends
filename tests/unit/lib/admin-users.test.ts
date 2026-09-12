import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The rules behind promoting, demoting and deleting, from
 * specs/028-admin-tools-and-roles.md.
 *
 * No real database: the CI unit job has no service containers, deliberately.
 * The chain below answers the four shapes `admin-users.ts` uses and records
 * what was written, so a refusal can be checked for having written **nothing**
 * rather than merely having returned `ok: false`.
 */
const { state, logger } = vi.hoisted(() => ({
  state: {
    target: undefined as { role: string } | undefined,
    adminCount: 2,
    updates: [] as unknown[],
    deletes: 0,
    locked: false,
    throws: false,
    listed: [] as unknown[],
    limits: [] as number[],
    countMissing: false,
  },
  logger: { error: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/db", () => {
  const tx = {
    execute: vi.fn(async () => {
      // The `for update` lock on the admin set. Recorded so a test can assert
      // the guard runs inside it rather than before it.
      state.locked = true;
    }),
    select: (shape: Record<string, unknown>) => ({
      from: () => ({
        where: () => {
          // A count query has one aliased column; the target lookup ends in
          // `.limit(1)`. Told apart by shape, like `favourites.test.ts`.
          const rows =
            "n" in shape ? (state.countMissing ? [] : [{ n: state.adminCount }]) : [state.target];
          return Object.assign(Promise.resolve(rows.filter(Boolean)), {
            limit: () => Promise.resolve(state.target === undefined ? [] : [state.target]),
          });
        },
      }),
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: async () => {
          state.updates.push(values);
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        state.deletes += 1;
      },
    }),
  };
  return {
    db: {
      transaction: async (run: (t: typeof tx) => Promise<unknown>) => {
        if (state.throws) throw new Error("database down");
        return run(tx);
      },
      select: () => ({
        from: () => ({
          orderBy: () => ({
            limit: (n: number) => {
              state.limits.push(n);
              return Promise.resolve(state.listed);
            },
          }),
        }),
      }),
    },
  };
});

beforeEach(() => {
  state.target = { role: "user" };
  state.adminCount = 2;
  state.updates = [];
  state.deletes = 0;
  state.locked = false;
  state.throws = false;
  state.listed = [];
  state.limits = [];
  state.countMissing = false;
  logger.error.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("changeRole", () => {
  it("promotes a reader", async () => {
    const { changeRole } = await import("@/lib/admin-users");

    await expect(changeRole("admin-1", "target-9", "admin")).resolves.toEqual({ ok: true });
    expect(state.updates).toHaveLength(1);
  });

  it("refuses to act on the acting admin's own row, and writes nothing", async () => {
    // The one-click lockout. An admin who wants to leave is removed by another
    // admin, which is why this is refused in both directions rather than only
    // for demotion.
    const { changeRole } = await import("@/lib/admin-users");

    await expect(changeRole("admin-1", "admin-1", "user")).resolves.toEqual({
      ok: false,
      reason: "self",
    });
    expect(state.updates).toHaveLength(0);
    expect(state.locked).toBe(false);
  });

  it("refuses a target that no longer exists", async () => {
    state.target = undefined;
    const { changeRole } = await import("@/lib/admin-users");

    await expect(changeRole("admin-1", "gone", "admin")).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(state.updates).toHaveLength(0);
  });

  it("refuses to demote the last admin", async () => {
    state.target = { role: "admin" };
    state.adminCount = 1;
    const { changeRole } = await import("@/lib/admin-users");

    await expect(changeRole("admin-1", "admin-2", "user")).resolves.toEqual({
      ok: false,
      reason: "last_admin",
    });
    expect(state.updates).toHaveLength(0);
  });

  it("demotes an admin while another remains", async () => {
    state.target = { role: "admin" };
    state.adminCount = 2;
    const { changeRole } = await import("@/lib/admin-users");

    await expect(changeRole("admin-1", "admin-2", "user")).resolves.toEqual({ ok: true });
    expect(state.updates).toHaveLength(1);
  });

  it("counts admins inside the lock", async () => {
    // The race is two admins demoting each other at once: both count two, both
    // proceed, and nobody is left. Locking the admin set makes the second
    // transaction wait and re-count.
    const { changeRole } = await import("@/lib/admin-users");

    await changeRole("admin-1", "target-9", "admin");

    expect(state.locked).toBe(true);
  });

  it("promoting is never refused for being the last admin", async () => {
    // The guard is about removing the last one. A promotion can only increase
    // the count, and a guard that fired here would make the app unrecoverable
    // from a single-admin state.
    state.target = { role: "user" };
    state.adminCount = 1;
    const { changeRole } = await import("@/lib/admin-users");

    await expect(changeRole("admin-1", "target-9", "admin")).resolves.toEqual({ ok: true });
  });

  it("reports a failure rather than throwing, and logs it", async () => {
    state.throws = true;
    const { changeRole } = await import("@/lib/admin-users");

    await expect(changeRole("admin-1", "target-9", "admin")).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Changing a user's role failed"
    );
  });
});

describe("deleteUser", () => {
  it("deletes a reader", async () => {
    const { deleteUser } = await import("@/lib/admin-users");

    await expect(deleteUser("admin-1", "target-9")).resolves.toEqual({ ok: true });
    expect(state.deletes).toBe(1);
  });

  it("refuses the acting admin's own account, and deletes nothing", async () => {
    const { deleteUser } = await import("@/lib/admin-users");

    await expect(deleteUser("admin-1", "admin-1")).resolves.toEqual({
      ok: false,
      reason: "self",
    });
    expect(state.deletes).toBe(0);
  });

  it("refuses a target that no longer exists", async () => {
    state.target = undefined;
    const { deleteUser } = await import("@/lib/admin-users");

    await expect(deleteUser("admin-1", "gone")).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(state.deletes).toBe(0);
  });

  it("refuses to delete the last admin", async () => {
    state.target = { role: "admin" };
    state.adminCount = 1;
    const { deleteUser } = await import("@/lib/admin-users");

    await expect(deleteUser("admin-1", "admin-2")).resolves.toEqual({
      ok: false,
      reason: "last_admin",
    });
    expect(state.deletes).toBe(0);
  });

  it("deletes a reader even when only one admin exists", async () => {
    // The guard counts admins, not users. A single-admin app must still be able
    // to remove an ordinary account.
    state.target = { role: "user" };
    state.adminCount = 1;
    const { deleteUser } = await import("@/lib/admin-users");

    await expect(deleteUser("admin-1", "reader-3")).resolves.toEqual({ ok: true });
    expect(state.deletes).toBe(1);
  });

  it("reports a failure rather than throwing, and logs it", async () => {
    state.throws = true;
    const { deleteUser } = await import("@/lib/admin-users");

    await expect(deleteUser("admin-1", "target-9")).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Deleting a user failed"
    );
  });
});

describe("listUsers", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "u1",
    email: "reader@example.fi",
    name: "Reader",
    role: "user",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  });

  it("returns the rows as they are when the role is recognised", async () => {
    state.listed = [row({ role: "admin" }), row({ id: "u2" })];
    const { listUsers } = await import("@/lib/admin-users");

    const users = await listUsers();

    expect(users.map((u) => u.role)).toEqual(["admin", "user"]);
  });

  it.each([
    ["an unknown role", "superuser"],
    ["the wrong case", "Admin"],
    ["an empty string", ""],
    ["null", null],
  ])("renders %s as a reader rather than trusting the column", async (_case, role) => {
    // The column is `text` and the first admin is made by hand in SQL, so an
    // unrecognised value is possible. Falling back to a reader is the direction
    // that grants nothing.
    state.listed = [row({ role })];
    const { listUsers } = await import("@/lib/admin-users");

    await expect(listUsers().then((u) => u[0]?.role)).resolves.toBe("user");
  });

  it("bounds the query so a wrong assumption cannot render unbounded", async () => {
    const { listUsers, MAX_USERS_LISTED } = await import("@/lib/admin-users");

    await listUsers();

    expect(state.limits).toEqual([MAX_USERS_LISTED]);
    expect(MAX_USERS_LISTED).toBe(500);
  });
});

describe("when the admin count comes back empty", () => {
  // Postgres `count(*)` always returns a row, so this is defensive rather than
  // reachable today. It is tested because the fallback decides an
  // authorisation: reading "no rows" as zero admins refuses, which is the safe
  // direction, and the alternative would be a crash inside a transaction.
  beforeEach(() => {
    state.countMissing = true;
    state.target = { role: "admin" };
  });

  it("treats it as no admins and refuses the demotion", async () => {
    const { changeRole } = await import("@/lib/admin-users");

    await expect(changeRole("admin-1", "admin-2", "user")).resolves.toEqual({
      ok: false,
      reason: "last_admin",
    });
    expect(state.updates).toHaveLength(0);
  });

  it("treats it as no admins and refuses the deletion", async () => {
    const { deleteUser } = await import("@/lib/admin-users");

    await expect(deleteUser("admin-1", "admin-2")).resolves.toEqual({
      ok: false,
      reason: "last_admin",
    });
    expect(state.deletes).toBe(0);
  });
});
