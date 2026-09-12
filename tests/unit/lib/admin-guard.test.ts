import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `requireAdmin`, from specs/028-admin-tools-and-roles.md.
 *
 * This is the only authorisation check in the app, so the tests are about the
 * direction it fails in. Every case that is not a signed-in user holding the
 * `admin` role in the **database** must answer `null`.
 */
const { currentUserId, state, logger } = vi.hoisted(() => ({
  currentUserId: vi.fn(),
  state: { rows: [] as { role: unknown }[], throws: false },
  logger: { error: vi.fn() },
}));

vi.mock("@/lib/current-user", () => ({ currentUserId }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            if (state.throws) throw new Error("database down");
            return Promise.resolve(state.rows);
          },
        }),
      }),
    }),
  },
}));

beforeEach(() => {
  currentUserId.mockReset();
  logger.error.mockReset();
  state.rows = [{ role: "admin" }];
  state.throws = false;
  currentUserId.mockResolvedValue("user-1");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requireAdmin", () => {
  it("answers the user id for a signed-in admin", async () => {
    const { requireAdmin } = await import("@/lib/admin-guard");

    await expect(requireAdmin()).resolves.toBe("user-1");
  });

  it("refuses a signed-out visitor", async () => {
    currentUserId.mockResolvedValue(null);
    const { requireAdmin } = await import("@/lib/admin-guard");

    await expect(requireAdmin()).resolves.toBeNull();
  });

  it("refuses a signed-in reader", async () => {
    state.rows = [{ role: "user" }];
    const { requireAdmin } = await import("@/lib/admin-guard");

    await expect(requireAdmin()).resolves.toBeNull();
  });

  it("refuses a session whose user row no longer exists", async () => {
    // Deletion cascades the session away, so this is a race rather than a
    // state — and refusing is the only safe reading of it.
    state.rows = [];
    const { requireAdmin } = await import("@/lib/admin-guard");

    await expect(requireAdmin()).resolves.toBeNull();
  });

  it.each([
    ["an unknown role", "superuser"],
    ["the wrong case", "Admin"],
    ["null", null],
    ["undefined", undefined],
  ])("refuses %s in the column", async (_case, role) => {
    state.rows = [{ role }];
    const { requireAdmin } = await import("@/lib/admin-guard");

    await expect(requireAdmin()).resolves.toBeNull();
  });

  it("refuses when the database fails, and says so", async () => {
    // A database failure is not permission. An outage must close the admin
    // area rather than open it.
    state.throws = true;
    const { requireAdmin } = await import("@/lib/admin-guard");

    await expect(requireAdmin()).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), userId: "user-1" }),
      "Could not determine whether the caller is an admin"
    );
  });

  it("refuses when the session itself cannot be read", async () => {
    // `currentUserId` goes through better-auth to Postgres, so it fails for the
    // same reasons the role lookup does. It sat outside the try/catch until
    // review caught it, which made a session-read failure a 500 rather than a
    // refusal — the opposite of what this function promises.
    currentUserId.mockRejectedValue(new Error("session store unreachable"));
    const { requireAdmin } = await import("@/lib/admin-guard");

    await expect(requireAdmin()).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), userId: null }),
      "Could not determine whether the caller is an admin"
    );
  });

  it("never asks the database for a signed-out visitor", async () => {
    // Not an optimisation: it is the assertion that the session alone can
    // never reach the role lookup.
    currentUserId.mockResolvedValue(null);
    state.throws = true; // would throw if the query were reached
    const { requireAdmin } = await import("@/lib/admin-guard");

    await expect(requireAdmin()).resolves.toBeNull();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
