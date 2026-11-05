import { beforeEach, describe, expect, it, vi } from "vitest";
import { warmModules } from "../../support/warm-module";

/**
 * The nickname's storage over a faked client: what each save answers. The SQL
 * itself, the unique key and the race, run against Postgres in
 * `tests/integration/nickname.test.ts`.
 *
 * decisions/077-nickname.md
 */

const { state, txDelete, txInsert, deleteWhere } = vi.hoisted(() => {
  const state = {
    selected: [] as unknown[],
    removed: [] as unknown[],
    inserted: [] as unknown[],
    failInsert: null as Error | null,
  };
  const txDelete = vi.fn(() => ({
    where: () => ({ returning: async () => state.removed }),
  }));
  const txInsert = vi.fn(() => ({
    values: () => ({
      onConflictDoNothing: () => ({
        returning: async () => {
          if (state.failInsert !== null) throw state.failInsert;
          return state.inserted;
        },
      }),
    }),
  }));
  const deleteWhere = vi.fn(async () => undefined);
  return { state, txDelete, txInsert, deleteWhere };
});

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => state.selected }) }),
    }),
    delete: () => ({ where: deleteWhere }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) =>
      run({ delete: txDelete, insert: txInsert }),
  },
}));

const { clearNickname, getNickname, saveNickname } = await import("@/lib/nickname-store");

const NEXT = { nickname: "Kalle", key: "kalle" };

beforeEach(() => {
  vi.clearAllMocks();
  state.selected = [];
  state.removed = [];
  state.inserted = [{ userId: "user-1" }];
  state.failInsert = null;
});

warmModules(() => import("@/lib/nickname-store"));

describe("getNickname", () => {
  it("returns the stored nickname", async () => {
    state.selected = [{ nickname: "Kalle" }];
    expect(await getNickname("user-1")).toBe("Kalle");
  });

  it("returns null for a user with none", async () => {
    expect(await getNickname("user-1")).toBeNull();
  });
});

describe("saveNickname", () => {
  it("answers set for a user who had none", async () => {
    expect(await saveNickname("user-1", NEXT)).toBe("set");
  });

  it("answers changed for a user who had one", async () => {
    state.removed = [{ userId: "user-1" }];
    expect(await saveNickname("user-1", NEXT)).toBe("changed");
  });

  it("answers removed for null, and writes nothing new", async () => {
    state.removed = [{ userId: "user-1" }];
    expect(await saveNickname("user-1", null)).toBe("removed");
    expect(txInsert).not.toHaveBeenCalled();
  });

  it("answers taken when the insert conflicts", async () => {
    state.inserted = [];
    expect(await saveNickname("user-1", NEXT)).toBe("taken");
  });

  it("lets any other failure through", async () => {
    state.failInsert = new Error("connection lost");
    await expect(saveNickname("user-1", NEXT)).rejects.toThrow("connection lost");
  });
});

describe("clearNickname", () => {
  it("deletes the user's row", async () => {
    await clearNickname("user-1");
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });
});
