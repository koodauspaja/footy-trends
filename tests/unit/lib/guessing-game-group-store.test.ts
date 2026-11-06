import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardEntry } from "@/lib/guessing-game";
import { warmModules } from "../../support/warm-module";

/**
 * Arvauspeli's group store over a faked client: each awaited statement takes
 * the next queued result, so every refusal and answer is reached in order. The
 * SQL itself, the locks and the trigger, run against Postgres in
 * `tests/integration/guessing-game-group.test.ts`.
 *
 * decisions/078-private-groups.md
 */

const { state, readBoardEntries, joinGameIn } = vi.hoisted(() => ({
  state: { results: [] as unknown[], ops: [] as string[], entries: [] as unknown[] },
  readBoardEntries: vi.fn(),
  joinGameIn: vi.fn(async () => undefined),
}));

vi.mock("@/db", () => {
  function statement(op: string) {
    return () => {
      state.ops.push(op);
      const chain: object = new Proxy(
        {},
        {
          get(_target, property) {
            if (property === "then") {
              return (resolve: (rows: unknown) => void, reject: (error: unknown) => void) => {
                if (state.results.length === 0) {
                  reject(new Error(`no result queued for ${op}`));
                  return;
                }
                const next = state.results.shift();
                if (next instanceof Error) reject(next);
                else resolve(next);
              };
            }
            return () => chain;
          },
        }
      );
      return chain;
    };
  }
  const client = {
    select: statement("select"),
    insert: statement("insert"),
    update: statement("update"),
    delete: statement("delete"),
  };
  return { db: { ...client, transaction: async (run: (tx: unknown) => unknown) => run(client) } };
});
vi.mock("@/lib/guessing-game-board", () => ({ readBoardEntries }));
vi.mock("@/lib/guessing-game-store", () => ({ joinGameIn }));

const store = await import("@/lib/guessing-game-group-store");
const NOW = new Date("2027-04-01T12:00:00Z");

function queue(...results: unknown[]) {
  state.results.push(...results);
}

const OWNER = { membershipId: 1, userId: "owner" };
const FRIEND = { membershipId: 2, userId: "friend" };
const OTHER = { membershipId: 3, userId: "other" };
const LOCK: unknown[] = [];
const PLAYER = [{ userId: "owner" }];

function entry(userId: string, balance: number): BoardEntry {
  return { userId, balance, settled: 1, nickname: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.results = [];
  state.ops = [];
  readBoardEntries.mockResolvedValue([]);
});

warmModules(() => import("@/lib/guessing-game-group-store"));

describe("createGroup", () => {
  it("creates the group with the player as its first member", async () => {
    queue(PLAYER, [{ groups: 9 }], [{ id: 5 }], []);
    expect(await store.createGroup("owner", "Kaverit", NOW)).toEqual({ ok: true, groupId: 5 });
    expect(state.ops).toEqual(["select", "select", "insert", "insert"]);
  });

  it("refuses a reader who is not playing", async () => {
    queue([]);
    expect(await store.createGroup("owner", "Kaverit", NOW)).toEqual({
      ok: false,
      reason: "not-player",
    });
  });

  it("refuses the eleventh group", async () => {
    queue(PLAYER, [{ groups: 10 }]);
    expect(await store.createGroup("owner", "Kaverit", NOW)).toEqual({
      ok: false,
      reason: "group-limit",
    });
  });

  it("counts no groups when the count reads no row", async () => {
    queue(PLAYER, [], [{ id: 5 }], []);
    expect(await store.createGroup("owner", "Kaverit", NOW)).toEqual({ ok: true, groupId: 5 });
  });

  it("fails when the insert returns no row", async () => {
    queue(PLAYER, [{ groups: 0 }], []);
    await expect(store.createGroup("owner", "Kaverit", NOW)).rejects.toThrow(/returned no row/);
  });

  it("passes on a failure that is not a refusal", async () => {
    queue(new Error("database down"));
    await expect(store.createGroup("owner", "Kaverit", NOW)).rejects.toThrow("database down");
  });
});

describe("joinGroup", () => {
  it("joins the game once the group would take the reader, then the group", async () => {
    queue([{ id: 5 }], [OWNER], PLAYER, [{ groups: 0 }], []);
    expect(await store.joinGroup("friend", "token", NOW)).toEqual({
      ok: true,
      groupId: 5,
      joined: true,
    });
    expect(joinGameIn).toHaveBeenCalledWith(expect.anything(), "friend", NOW);
  });

  it("joins nothing for a member already in the group", async () => {
    queue([{ id: 5 }], [OWNER, FRIEND]);
    expect(await store.joinGroup("friend", "token", NOW)).toEqual({
      ok: true,
      groupId: 5,
      joined: false,
    });
  });

  it("refuses a link that names no group, joining nothing of the game", async () => {
    queue([]);
    expect(await store.joinGroup("friend", "token", NOW)).toEqual({
      ok: false,
      reason: "invalid-link",
    });
    expect(joinGameIn).not.toHaveBeenCalled();
  });

  it("refuses the fifty-first member", async () => {
    const members = Array.from({ length: 50 }, (_, index) => ({
      membershipId: index + 1,
      userId: `member-${index}`,
    }));
    queue([{ id: 5 }], members);
    expect(await store.joinGroup("friend", "token", NOW)).toEqual({ ok: false, reason: "full" });
    expect(joinGameIn).not.toHaveBeenCalled();
  });

  it("refuses a player already in ten groups", async () => {
    queue([{ id: 5 }], [OWNER], PLAYER, [{ groups: 10 }]);
    expect(await store.joinGroup("friend", "token", NOW)).toEqual({
      ok: false,
      reason: "group-limit",
    });
  });
});

describe("leaveGroup", () => {
  it("passes ownership to the next member when the owner leaves", async () => {
    queue(LOCK, [FRIEND, OWNER, OTHER], []);
    expect(await store.leaveGroup("owner", 5)).toEqual({
      ok: true,
      newOwnerId: "friend",
      emptied: false,
    });
    expect(state.ops).toEqual(["select", "select", "delete"]);
  });

  it("passes nothing on when another member leaves", async () => {
    queue(LOCK, [OWNER, FRIEND], []);
    expect(await store.leaveGroup("friend", 5)).toEqual({
      ok: true,
      newOwnerId: null,
      emptied: false,
    });
  });

  it("says when the last member leaves", async () => {
    queue(LOCK, [OWNER], []);
    expect(await store.leaveGroup("owner", 5)).toEqual({
      ok: true,
      newOwnerId: null,
      emptied: true,
    });
  });

  it("refuses a reader who is not a member", async () => {
    queue(LOCK, [OWNER]);
    expect(await store.leaveGroup("friend", 5)).toEqual({ ok: false, reason: "not-member" });
  });
});

describe("the owner's actions", () => {
  it("removes another member by their membership", async () => {
    queue(LOCK, [OWNER, FRIEND], []);
    expect(await store.removeMember("owner", 5, 2)).toEqual({ ok: true, removedUserId: "friend" });
  });

  it("refuses removing a membership the group does not have", async () => {
    queue(LOCK, [OWNER, FRIEND]);
    expect(await store.removeMember("owner", 5, 9)).toEqual({ ok: false, reason: "not-member" });
  });

  it("refuses the owner removing themselves", async () => {
    queue(LOCK, [OWNER, FRIEND]);
    expect(await store.removeMember("owner", 5, 1)).toEqual({ ok: false, reason: "self" });
  });

  it("refuses a member who is not the owner", async () => {
    queue(LOCK, [OWNER, FRIEND]);
    expect(await store.removeMember("friend", 5, 1)).toEqual({ ok: false, reason: "not-owner" });
  });

  it("refuses a reader who is not a member", async () => {
    queue(LOCK, [OWNER]);
    expect(await store.removeMember("other", 5, 1)).toEqual({ ok: false, reason: "not-member" });
  });

  it.each([
    ["renames", () => store.renameGroup("owner", 5, "Uusi"), "update"],
    ["renews the link of", () => store.renewInviteLink("owner", 5), "update"],
    ["deletes", () => store.deleteGroup("owner", 5), "delete"],
  ])("%s the group for its owner", async (_name, write, op) => {
    queue(LOCK, [OWNER, FRIEND], []);
    expect(await write()).toEqual({ ok: true });
    expect(state.ops.at(-1)).toBe(op);
  });

  it.each([
    ["rename", () => store.renameGroup("friend", 5, "Uusi")],
    ["renew", () => store.renewInviteLink("friend", 5)],
    ["delete", () => store.deleteGroup("friend", 5)],
  ])("refuses a %s by a member who is not the owner", async (_name, write) => {
    queue(LOCK, [OWNER, FRIEND]);
    expect(await write()).toEqual({ ok: false, reason: "not-owner" });
  });
});

describe("readGroupsOf", () => {
  it("lists nothing, and reads no board, for a player in no group", async () => {
    queue([]);
    expect(await store.readGroupsOf("owner", 2027)).toEqual([]);
    expect(readBoardEntries).not.toHaveBeenCalled();
  });

  it("ranks the player among each group's members, by name, then by id", async () => {
    queue([
      { groupId: 8, name: "Pallo", userId: "owner" },
      { groupId: 8, name: "Pallo", userId: "friend" },
      { groupId: 4, name: "Pallo", userId: "owner" },
      { groupId: 6, name: "Äijät", userId: "owner" },
      { groupId: 6, name: "Äijät", userId: "other" },
    ]);
    readBoardEntries.mockResolvedValue([
      entry("friend", 1200),
      entry("owner", 1000),
      entry("other", 900),
      entry("outsider", 2000),
    ]);
    expect(await store.readGroupsOf("owner", 2027)).toEqual([
      { groupId: 4, name: "Pallo", members: 1, rank: 1 },
      { groupId: 8, name: "Pallo", members: 2, rank: 2 },
      { groupId: 6, name: "Äijät", members: 2, rank: 1 },
    ]);
    // Read for the members of the reader's groups only, each once.
    expect(readBoardEntries).toHaveBeenCalledWith(2027, ["owner", "friend", "other"]);
  });

  it("gives no rank with no season to rank, without reading a board", async () => {
    queue([{ groupId: 4, name: "Pallo", userId: "owner" }]);
    expect(await store.readGroupsOf("owner", null)).toEqual([
      { groupId: 4, name: "Pallo", members: 1, rank: null },
    ]);
    expect(readBoardEntries).not.toHaveBeenCalled();
  });
});

describe("readGroup", () => {
  const rows = [
    { membershipId: 3, userId: "friend", nickname: null, name: "Kaverit", inviteToken: "t" },
    { membershipId: 1, userId: "owner", nickname: "Omistaja", name: "Kaverit", inviteToken: "t" },
  ];

  it("is null for a reader who is not a member", async () => {
    queue(rows);
    expect(await store.readGroup("outsider", 5, 2027)).toBeNull();
  });

  it("lists the members by when they joined, with the owner and the reader named", async () => {
    queue(rows);
    readBoardEntries.mockResolvedValue([entry("friend", 1100), entry("outsider", 2000)]);
    const group = await store.readGroup("friend", 5, 2027);
    expect(readBoardEntries).toHaveBeenCalledWith(2027, ["friend", "owner"]);
    expect(group).toMatchObject({
      groupId: 5,
      name: "Kaverit",
      inviteToken: "t",
      isOwner: false,
      members: [
        { membershipId: 1, nickname: "Omistaja", self: false, owner: true },
        { membershipId: 3, nickname: null, self: true, owner: false },
      ],
    });
    expect(group?.board?.players).toBe(1);
    expect(group?.board?.rows[0]).toMatchObject({ balance: 1100, self: true });
  });

  it("has no board with no season to rank", async () => {
    queue(rows);
    expect((await store.readGroup("owner", 5, null))?.board).toBeNull();
  });
});

describe("readInvite", () => {
  it("is null for a token that names no group", async () => {
    queue([]);
    expect(await store.readInvite("friend", "token")).toBeNull();
  });

  it("names the group and its size to a signed-out reader, and reads nothing of theirs", async () => {
    queue([{ groupId: 5, name: "Kaverit" }], [{ members: 3 }]);
    expect(await store.readInvite(null, "token")).toEqual({
      groupId: 5,
      name: "Kaverit",
      members: 3,
      member: false,
      player: false,
    });
    expect(state.ops).toHaveLength(2);
  });

  it("says whether a signed-in reader is already in it and plays", async () => {
    queue([{ groupId: 5, name: "Kaverit" }], [], [{ id: 2 }], [{ userId: "friend" }]);
    expect(await store.readInvite("friend", "token")).toEqual({
      groupId: 5,
      name: "Kaverit",
      members: 0,
      member: true,
      player: true,
    });
  });
});
