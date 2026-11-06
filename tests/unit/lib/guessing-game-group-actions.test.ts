import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Arvauspeli's group actions: input from the browser parsed before anything
 * is read, the session checked, each refusal answered as the page shows it,
 * and the log line each write and refusal leaves, with ids only.
 *
 * decisions/078-private-groups.md
 */

const { currentUserId, store, logger } = vi.hoisted(() => ({
  currentUserId: vi.fn(async (): Promise<string | null> => "user-1"),
  store: {
    createGroup: vi.fn(),
    joinGroup: vi.fn(),
    leaveGroup: vi.fn(),
    removeMember: vi.fn(),
    renameGroup: vi.fn(),
    renewInviteLink: vi.fn(),
    deleteGroup: vi.fn(),
  },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/current-user", () => ({ currentUserId }));
vi.mock("@/lib/guessing-game-group-store", () => store);
vi.mock("@/lib/logger", () => ({ logger }));

const actions = await import("@/lib/guessing-game-group-actions");
const TOKEN = "a".repeat(43);

beforeEach(() => {
  vi.clearAllMocks();
  currentUserId.mockResolvedValue("user-1");
});

describe("createGroupAction", () => {
  it("creates the group under the name as stored, and logs it", async () => {
    store.createGroup.mockResolvedValue({ ok: true, groupId: 5 });
    expect(await actions.createGroupAction("  Kaverit ")).toEqual({ ok: true, groupId: 5 });
    expect(store.createGroup).toHaveBeenCalledWith("user-1", "Kaverit", expect.any(Date));
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", groupId: 5 },
      "Arvauspeli group created"
    );
  });

  it.each([
    ["ab", "name-length"],
    ["Kaverit!", "name-characters"],
    ["Iso paska", "word-list"],
  ])("refuses %s by its rule, without a write, and logs the reason only", async (name, reason) => {
    expect(await actions.createGroupAction(name)).toEqual({ ok: false, reason });
    expect(store.createGroup).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", reason },
      "Arvauspeli group refused"
    );
  });

  it("answers a reader not playing as a failure", async () => {
    store.createGroup.mockResolvedValue({ ok: false, reason: "not-player" });
    expect(await actions.createGroupAction("Kaverit")).toEqual({ ok: false, reason: "failed" });
  });

  it("answers the limit as the page says it", async () => {
    store.createGroup.mockResolvedValue({ ok: false, reason: "group-limit" });
    expect(await actions.createGroupAction("Kaverit")).toEqual({
      ok: false,
      reason: "group-limit",
    });
  });

  it("refuses a name that is not text, before reading the session", async () => {
    expect(await actions.createGroupAction(5)).toEqual({ ok: false, reason: "failed" });
    expect(currentUserId).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { action: "create" },
      "Arvauspeli group action refused: not parsed"
    );
  });

  it("refuses without a session", async () => {
    currentUserId.mockResolvedValue(null);
    expect(await actions.createGroupAction("Kaverit")).toEqual({ ok: false, reason: "failed" });
    expect(logger.warn).toHaveBeenCalledWith(
      { action: "create" },
      "Arvauspeli group action refused: no session"
    );
  });

  it("answers a failed write as a failure, and logs it with the user", async () => {
    store.createGroup.mockRejectedValue(new Error("database down"));
    expect(await actions.createGroupAction("Kaverit")).toEqual({ ok: false, reason: "failed" });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", action: "create" }),
      "An Arvauspeli group action failed"
    );
  });

  it("logs a failed session read with no user", async () => {
    currentUserId.mockRejectedValue(new Error("auth down"));
    expect(await actions.createGroupAction("Kaverit")).toEqual({ ok: false, reason: "failed" });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null }),
      "An Arvauspeli group action failed"
    );
  });
});

describe("joinGroupAction", () => {
  it("joins, logging only a join that was written", async () => {
    store.joinGroup.mockResolvedValue({ ok: true, groupId: 5, joined: true });
    expect(await actions.joinGroupAction(TOKEN)).toEqual({ ok: true, groupId: 5 });
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", groupId: 5 },
      "Arvauspeli group joined"
    );

    vi.clearAllMocks();
    store.joinGroup.mockResolvedValue({ ok: true, groupId: 5, joined: false });
    expect(await actions.joinGroupAction(TOKEN)).toEqual({ ok: true, groupId: 5 });
    expect(logger.info).not.toHaveBeenCalled();
  });

  it.each(["full", "group-limit", "invalid-link"])("answers %s as itself", async (reason) => {
    store.joinGroup.mockResolvedValue({ ok: false, reason });
    expect(await actions.joinGroupAction(TOKEN)).toEqual({ ok: false, reason });
  });

  it("refuses a token of the wrong shape without a read, and never logs it", async () => {
    expect(await actions.joinGroupAction("short")).toEqual({ ok: false, reason: "failed" });
    expect(store.joinGroup).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("short");
  });
});

describe("leaveGroupAction", () => {
  it("logs the departure, and the ownership passing on", async () => {
    store.leaveGroup.mockResolvedValue({ ok: true, newOwnerId: "user-2", emptied: false });
    expect(await actions.leaveGroupAction(5)).toEqual({ ok: true });
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", groupId: 5, emptied: false },
      "Arvauspeli group left"
    );
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", groupId: 5, newOwnerId: "user-2" },
      "Arvauspeli group ownership passed"
    );
  });

  it("logs no ownership passing when none did", async () => {
    store.leaveGroup.mockResolvedValue({ ok: true, newOwnerId: null, emptied: true });
    await actions.leaveGroupAction(5);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it("answers a reader no longer a member as stale, and logs the group", async () => {
    store.leaveGroup.mockResolvedValue({ ok: false, reason: "not-member" });
    expect(await actions.leaveGroupAction(5)).toEqual({ ok: false, reason: "stale" });
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", groupId: 5, reason: "not-member" },
      "Arvauspeli group refused"
    );
  });

  it("refuses an id that is not a row's", async () => {
    expect(await actions.leaveGroupAction("5")).toEqual({ ok: false, reason: "failed" });
    expect(store.leaveGroup).not.toHaveBeenCalled();
  });
});

describe("removeMemberAction", () => {
  it("removes the member and logs whom", async () => {
    store.removeMember.mockResolvedValue({ ok: true, removedUserId: "user-2" });
    expect(await actions.removeMemberAction(5, 2)).toEqual({ ok: true });
    expect(store.removeMember).toHaveBeenCalledWith("user-1", 5, 2);
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", groupId: 5, removedUserId: "user-2" },
      "Arvauspeli group member removed"
    );
  });

  it("answers a non-owner as stale and the owner themselves as a failure", async () => {
    store.removeMember.mockResolvedValue({ ok: false, reason: "not-owner" });
    expect(await actions.removeMemberAction(5, 2)).toEqual({ ok: false, reason: "stale" });
    store.removeMember.mockResolvedValue({ ok: false, reason: "self" });
    expect(await actions.removeMemberAction(5, 1)).toEqual({ ok: false, reason: "failed" });
  });

  it.each([
    [5, 0],
    [0, 2],
  ])("refuses the ids %s and %s", async (groupId, membershipId) => {
    expect(await actions.removeMemberAction(groupId, membershipId)).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(store.removeMember).not.toHaveBeenCalled();
  });
});

describe("renameGroupAction", () => {
  it("renames under the stored form, and logs it", async () => {
    store.renameGroup.mockResolvedValue({ ok: true });
    expect(await actions.renameGroupAction(5, " Uusi  nimi ")).toEqual({ ok: true });
    expect(store.renameGroup).toHaveBeenCalledWith("user-1", 5, "Uusi nimi");
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", groupId: 5 },
      "Arvauspeli group renamed"
    );
  });

  it("refuses a name breaking a rule without a write", async () => {
    expect(await actions.renameGroupAction(5, "ab")).toEqual({ ok: false, reason: "name-length" });
    expect(store.renameGroup).not.toHaveBeenCalled();
  });

  it.each([
    ["x", "Uusi"],
    [5, null],
  ])("refuses %s and %s", async (groupId, name) => {
    expect(await actions.renameGroupAction(groupId, name)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("renewInviteLinkAction and deleteGroupAction", () => {
  it.each([
    [actions.renewInviteLinkAction, store.renewInviteLink, "Arvauspeli group link renewed"],
    [actions.deleteGroupAction, store.deleteGroup, "Arvauspeli group deleted"],
  ])("does the owner's write and logs it", async (action, write, line) => {
    write.mockResolvedValue({ ok: true });
    expect(await action(5)).toEqual({ ok: true });
    expect(logger.info).toHaveBeenCalledWith({ userId: "user-1", groupId: 5 }, line);
  });

  it.each([
    [actions.renewInviteLinkAction, store.renewInviteLink],
    [actions.deleteGroupAction, store.deleteGroup],
  ])("refuses an id that is not a row's", async (action, write) => {
    expect(await action(-1)).toEqual({ ok: false, reason: "failed" });
    expect(write).not.toHaveBeenCalled();
  });
});
