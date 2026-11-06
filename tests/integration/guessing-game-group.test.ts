import { eq, gte, inArray, like } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { gameGroup, gameGroupMember, gamePlayer, tasoMatches, user } from "@/db/schema";
import { readBoard } from "@/lib/guessing-game-board";
import { MAX_GROUPS, MAX_MEMBERS } from "@/lib/guessing-game-group";
import {
  createGroup,
  deleteGroup,
  joinGroup,
  leaveGroup,
  readGroup,
  readGroupsOf,
  readInvite,
  removeMember,
  renameGroup,
  renewInviteLink,
} from "@/lib/guessing-game-group-store";
import { joinGame, placeGuess, settleGuesses } from "@/lib/guessing-game-store";

/**
 * Arvauspeli's private groups against a real Postgres: the board restricted to
 * members, the limits under a race, the owner passing on, and the trigger that
 * deletes a group left empty.
 *
 * decisions/078-private-groups.md
 */

const SEASON = 2095;
const NOW = new Date("2095-05-01T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);
const MATCH_ID = 9_500_001;
const PREFIX = "itest-group-";
const OWNER = `${PREFIX}owner`;
const FRIEND = `${PREFIX}friend`;
const OUTSIDER = `${PREFIX}outsider`;
const NEWCOMER = `${PREFIX}newcomer`;

async function storeUsers(ids: readonly string[]) {
  await db.insert(user).values(
    ids.map((id) => ({
      id,
      name: "Integration Player",
      email: `${id}@example.com`,
      emailVerified: true,
    }))
  );
}

async function tokenOf(groupId: number): Promise<string> {
  const [row] = await db
    .select({ token: gameGroup.inviteToken })
    .from(gameGroup)
    .where(eq(gameGroup.id, groupId));
  if (row === undefined) throw new Error("no such group");
  return row.token;
}

async function groupExists(groupId: number): Promise<boolean> {
  const rows = await db
    .select({ id: gameGroup.id })
    .from(gameGroup)
    .where(eq(gameGroup.id, groupId));
  return rows.length > 0;
}

async function newGroup(owner: string): Promise<number> {
  const created = await createGroup(owner, "Kaverit", NOW);
  if (!created.ok) throw new Error(created.reason);
  return created.groupId;
}

async function membersOf(groupId: number): Promise<string[]> {
  const rows = await db
    .select({ userId: gameGroupMember.userId })
    .from(gameGroupMember)
    .where(eq(gameGroupMember.groupId, groupId))
    .orderBy(gameGroupMember.id);
  return rows.map((row) => row.userId);
}

beforeEach(async () => {
  await storeUsers([OWNER, FRIEND, OUTSIDER, NEWCOMER]);
  await db.insert(tasoMatches).values({
    providerMatchId: MATCH_ID,
    competitionCode: `spljp${SEASON % 100}`,
    categoryId: "VL",
    seasonId: SEASON,
    groupId: 1,
    groupName: "Runkosarja",
    kickoffAt: at(200),
    status: "SCHEDULED",
    homeTeamProviderId: 1,
    homeTeamName: "HJK",
    awayTeamProviderId: 2,
    awayTeamName: "KuPS",
  });
  for (const id of [OWNER, FRIEND, OUTSIDER]) await joinGame(id, NOW);
});

afterEach(async () => {
  await db.delete(user).where(like(user.id, `${PREFIX}%`));
  await db.delete(tasoMatches).where(gte(tasoMatches.providerMatchId, MATCH_ID));
});

describe("a group's board", () => {
  it("ranks only its members, by the same figures as the public board", async () => {
    const groupId = await newGroup(OWNER);
    expect(await joinGroup(FRIEND, await tokenOf(groupId), NOW)).toMatchObject({
      ok: true,
      joined: true,
    });
    // The friend is right, the owner and the outsider wrong.
    for (const [id, outcome] of [
      [OWNER, "2"],
      [FRIEND, "1"],
      [OUTSIDER, "2"],
    ] as const) {
      expect(
        await placeGuess(id, MATCH_ID, { kind: "outcome", outcome }, 10, () => NOW)
      ).toMatchObject({ ok: true });
    }
    await db
      .update(tasoMatches)
      .set({ status: "FINISHED", homeGoals: 1, awayGoals: 0 })
      .where(eq(tasoMatches.providerMatchId, MATCH_ID));
    await settleGuesses(at(210));

    // 1 000 less the price of 10, and the friend's 30 back for a right 1X2.
    const figures = (rows: ReadonlyArray<{ rank: number; balance: number; self: boolean }>) =>
      rows.map((row) => [row.rank, row.balance, row.self]);
    expect(figures((await readBoard(SEASON, OWNER)).rows)).toEqual([
      [1, 1020, false],
      // A tie with no nicknames goes by user id: the outsider's sorts first.
      [2, 990, false],
      [2, 990, true],
    ]);
    const group = await readGroup(OWNER, groupId, SEASON);
    expect(group?.board?.players).toBe(2);
    expect(figures(group?.board?.rows ?? [])).toEqual([
      [1, 1020, false],
      [2, 990, true],
    ]);
    expect(await readGroupsOf(OWNER, SEASON)).toEqual([
      { groupId, name: "Kaverit", members: 2, rank: 2 },
    ]);
  });

  it("gives a member with no guess this season no rank", async () => {
    const groupId = await newGroup(OWNER);
    expect(await readGroupsOf(OWNER, SEASON)).toEqual([
      { groupId, name: "Kaverit", members: 1, rank: null },
    ]);
    expect((await readGroup(OWNER, groupId, SEASON))?.board?.players).toBe(0);
  });

  it("answers a reader outside the group as a group that does not exist", async () => {
    const groupId = await newGroup(OWNER);
    expect(await readGroup(OUTSIDER, groupId, SEASON)).toBeNull();
    expect(await readGroup(OWNER, groupId + 1_000_000, SEASON)).toBeNull();
  });
});

describe("joining", () => {
  it("joins the game and the group in one write for a reader not yet playing", async () => {
    const groupId = await newGroup(OWNER);
    const token = await tokenOf(groupId);
    expect(await readInvite(NEWCOMER, token)).toEqual({
      groupId,
      name: "Kaverit",
      members: 1,
      member: false,
      player: false,
    });

    expect(await joinGroup(NEWCOMER, token, NOW)).toMatchObject({ ok: true, joined: true });

    expect(await db.select().from(gamePlayer).where(eq(gamePlayer.userId, NEWCOMER))).toHaveLength(
      1
    );
    expect(await readInvite(NEWCOMER, token)).toMatchObject({ member: true, player: true });
    // Following the link again joins nothing.
    expect(await joinGroup(NEWCOMER, token, NOW)).toMatchObject({ ok: true, joined: false });
  });

  it("refuses the old link once renewed, and the new one works", async () => {
    const groupId = await newGroup(OWNER);
    const old = await tokenOf(groupId);
    expect(await renewInviteLink(OWNER, groupId)).toEqual({ ok: true });
    expect(await joinGroup(FRIEND, old, NOW)).toEqual({ ok: false, reason: "invalid-link" });
    expect(await readInvite(FRIEND, old)).toBeNull();
    expect(await joinGroup(FRIEND, await tokenOf(groupId), NOW)).toMatchObject({ ok: true });
  });

  it("refuses a join through a link renewed while the join waited", async () => {
    const groupId = await newGroup(OWNER);
    const old = await tokenOf(groupId);
    const held = Promise.withResolvers<void>();
    const renewed = Promise.withResolvers<void>();
    const renewal = db.transaction(async (tx) => {
      await tx
        .update(gameGroup)
        .set({ inviteToken: "b".repeat(43) })
        .where(eq(gameGroup.id, groupId));
      renewed.resolve();
      await held.promise;
    });
    await renewed.promise;
    const join = joinGroup(FRIEND, old, NOW);
    await new Promise((resolve) => setTimeout(resolve, 200));
    held.resolve();
    await renewal;
    expect(await join).toEqual({ ok: false, reason: "invalid-link" });
    expect(await membersOf(groupId)).toEqual([OWNER]);
  });

  it("lets only one of two joins take the last place, and leaves the refused reader unjoined", async () => {
    const groupId = await newGroup(OWNER);
    const fillers = Array.from(
      { length: MAX_MEMBERS - 1 },
      (_, index) => `${PREFIX}filler-${index}`
    );
    await storeUsers(fillers);
    for (const id of fillers.slice(1)) {
      await joinGroup(id, await tokenOf(groupId), NOW);
    }
    const token = await tokenOf(groupId);

    const outcomes = await Promise.all([
      joinGroup(fillers[0] as string, token, NOW),
      joinGroup(NEWCOMER, token, NOW),
    ]);

    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(outcomes.filter((outcome) => !outcome.ok)).toEqual([{ ok: false, reason: "full" }]);
    expect(await membersOf(groupId)).toHaveLength(MAX_MEMBERS);
    // The refused one's joining of the game was undone with it.
    const players = await db
      .select({ userId: gamePlayer.userId })
      .from(gamePlayer)
      .where(inArray(gamePlayer.userId, [fillers[0] as string, NEWCOMER]));
    expect(players).toHaveLength(1);
  });

  it("refuses a player's group past the limit, created or joined", async () => {
    for (let count = 0; count < MAX_GROUPS; count += 1) await newGroup(OWNER);
    expect(await createGroup(OWNER, "Liikaa", NOW)).toEqual({ ok: false, reason: "group-limit" });
    const other = await newGroup(FRIEND);
    expect(await joinGroup(OWNER, await tokenOf(other), NOW)).toEqual({
      ok: false,
      reason: "group-limit",
    });
  });

  it("refuses creating a group for a reader not playing", async () => {
    expect(await createGroup(NEWCOMER, "Kaverit", NOW)).toEqual({
      ok: false,
      reason: "not-player",
    });
  });
});

describe("leaving and the owner", () => {
  async function groupOfThree(): Promise<number> {
    const groupId = await newGroup(OWNER);
    await joinGroup(FRIEND, await tokenOf(groupId), NOW);
    await joinGroup(OUTSIDER, await tokenOf(groupId), NOW);
    return groupId;
  }

  it("passes ownership to the earliest-joined member when the owner leaves", async () => {
    const groupId = await groupOfThree();
    expect(await leaveGroup(OWNER, groupId)).toEqual({
      ok: true,
      newOwnerId: FRIEND,
      emptied: false,
    });
    const group = await readGroup(FRIEND, groupId, SEASON);
    expect(group?.isOwner).toBe(true);
    expect(await renameGroup(OUTSIDER, groupId, "Uusi")).toEqual({
      ok: false,
      reason: "not-owner",
    });
    expect(await renameGroup(FRIEND, groupId, "Uusi")).toEqual({ ok: true });
    expect((await readGroup(OUTSIDER, groupId, SEASON))?.name).toBe("Uusi");
  });

  it("passes ownership on when the owner deletes their account", async () => {
    const groupId = await groupOfThree();
    await db.delete(user).where(eq(user.id, OWNER));
    expect(await membersOf(groupId)).toEqual([FRIEND, OUTSIDER]);
    expect((await readGroup(FRIEND, groupId, SEASON))?.isOwner).toBe(true);
  });

  it("deletes the group with its last member, by leaving or by the account's deletion", async () => {
    const left = await newGroup(OWNER);
    expect(await leaveGroup(OWNER, left)).toEqual({ ok: true, newOwnerId: null, emptied: true });
    expect(await groupExists(left)).toBe(false);

    const deleted = await newGroup(FRIEND);
    await db.delete(user).where(eq(user.id, FRIEND));
    expect(await groupExists(deleted)).toBe(false);
  });

  it("deletes the group when its last two members' accounts are deleted at once", async () => {
    const groupId = await newGroup(OWNER);
    await joinGroup(FRIEND, await tokenOf(groupId), NOW);
    // The owner's deletion is held open while the friend's runs: without the
    // trigger's lock each would see the other's membership and keep the group.
    const held = Promise.withResolvers<void>();
    const ownerDeleted = Promise.withResolvers<void>();
    const first = db.transaction(async (tx) => {
      await tx.delete(user).where(eq(user.id, OWNER));
      ownerDeleted.resolve();
      await held.promise;
    });
    await ownerDeleted.promise;
    // Started now, not when awaited: a query builder runs only once it is.
    const second = db.delete(user).where(eq(user.id, FRIEND)).execute();
    await new Promise((resolve) => setTimeout(resolve, 200));
    held.resolve();
    await Promise.all([first, second]);
    expect(await groupExists(groupId)).toBe(false);
  });

  it("lets the owner remove a member, who can rejoin by the same link", async () => {
    const groupId = await groupOfThree();
    const friend = (await readGroup(OWNER, groupId, SEASON))?.members.find(
      (member) => !member.self && !member.owner
    );
    if (friend === undefined) throw new Error("no member to remove");
    expect(await removeMember(FRIEND, groupId, friend.membershipId)).toEqual({
      ok: false,
      reason: "not-owner",
    });
    expect(await removeMember(OWNER, groupId, friend.membershipId)).toEqual({
      ok: true,
      removedUserId: FRIEND,
    });
    expect(await membersOf(groupId)).toEqual([OWNER, OUTSIDER]);
    expect(await joinGroup(FRIEND, await tokenOf(groupId), NOW)).toMatchObject({ joined: true });
  });

  it("deletes the group for its owner only, leaving every balance", async () => {
    const groupId = await groupOfThree();
    const before = await readBoard(SEASON, OWNER);
    expect(await deleteGroup(FRIEND, groupId)).toEqual({ ok: false, reason: "not-owner" });
    expect(await deleteGroup(OWNER, groupId)).toEqual({ ok: true });
    expect(await groupExists(groupId)).toBe(false);
    expect(await readBoard(SEASON, OWNER)).toEqual(before);
    expect(await leaveGroup(FRIEND, groupId)).toEqual({ ok: false, reason: "not-member" });
  });
});
