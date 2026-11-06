import { and, count, desc, eq, inArray, lte } from "drizzle-orm";
import { db, type Transaction } from "@/db";
import {
  gameGroup,
  gameGroupMember,
  gameGuess,
  gameLedger,
  gamePlayer,
  tasoMatches,
  userNickname,
} from "@/db/schema";
import { type Board, type Guess, rankBoard } from "./guessing-game";
import { readBoardEntries, readModelGuesses } from "./guessing-game-board";
import { MAX_GROUPS, MAX_MEMBERS, newInviteToken, ownerOf } from "./guessing-game-group";
import type { ModelGuess } from "./guessing-game-models";
import {
  joinGameIn,
  PAYMENT_KINDS,
  type Paid,
  paymentsOf,
  settledResult,
  storedGuess,
} from "./guessing-game-store";
import { logger } from "./logger";

/**
 * Reading and writing `Arvauspeli`'s private groups. The rules are in
 * `guessing-game-group.ts`; this stores what passed them, and checks the
 * limits, membership and ownership under a lock.
 *
 * decisions/078-private-groups.md
 */

/**
 * Why a group write was refused.
 *
 * decisions/078-private-groups.md
 */
export type GroupRefusal =
  | "not-player"
  | "full"
  | "group-limit"
  | "invalid-link"
  | "not-member"
  | "not-owner"
  | "self";

export type GroupOutcome<T> = ({ ok: true } & T) | { ok: false; reason: GroupRefusal };

/**
 * Thrown inside a transaction to undo what it wrote, a join's joining the game
 * included, and answered as the refusal it carries.
 *
 * decisions/078-private-groups.md
 */
class GroupRefused extends Error {
  constructor(readonly reason: GroupRefusal) {
    super(reason);
  }
}

function refuse(reason: GroupRefusal): never {
  throw new GroupRefused(reason);
}

async function inTransaction<T>(run: (tx: Transaction) => Promise<T>): Promise<GroupOutcome<T>> {
  try {
    return { ok: true, ...(await db.transaction(run)) };
  } catch (error) {
    if (error instanceof GroupRefused) return { ok: false, reason: error.reason };
    throw error;
  }
}

type Member = { membershipId: number; userId: string };

/**
 * Locks the player's row, so their own group writes run one after the other
 * and cannot pass the limit together; `no key update` leaves the foreign-key
 * checks of their other rows unblocked. Refused for a reader not playing.
 *
 * decisions/078-private-groups.md
 */
async function lockPlayer(tx: Transaction, userId: string): Promise<void> {
  const rows = await tx
    .select({ userId: gamePlayer.userId })
    .from(gamePlayer)
    .where(eq(gamePlayer.userId, userId))
    .for("no key update");
  if (rows.length === 0) refuse("not-player");
}

async function groupCountOf(tx: Transaction, userId: string): Promise<number> {
  const [row] = await tx
    .select({ groups: count() })
    .from(gameGroupMember)
    .where(eq(gameGroupMember.userId, userId));
  return row?.groups ?? 0;
}

/**
 * Locks a group's row and reads its members, so joins, departures and the
 * owner's actions on one group are decided one after the other.
 *
 * decisions/078-private-groups.md
 */
async function lockedMembers(tx: Transaction, groupId: number): Promise<Member[]> {
  await tx
    .select({ id: gameGroup.id })
    .from(gameGroup)
    .where(eq(gameGroup.id, groupId))
    .for("update");
  return membersOf(tx, groupId);
}

function membersOf(tx: Transaction, groupId: number): Promise<Member[]> {
  return tx
    .select({ membershipId: gameGroupMember.id, userId: gameGroupMember.userId })
    .from(gameGroupMember)
    .where(eq(gameGroupMember.groupId, groupId));
}

function memberIn(members: readonly Member[], userId: string): Member {
  return members.find((member) => member.userId === userId) ?? refuse("not-member");
}

/**
 * The group's members, locked, once the caller is shown to own it.
 *
 * decisions/078-private-groups.md
 */
async function ownedMembers(tx: Transaction, userId: string, groupId: number): Promise<Member[]> {
  const members = await lockedMembers(tx, groupId);
  if (ownerOf(members) !== memberIn(members, userId)) refuse("not-owner");
  return members;
}

/**
 * Creates a group with the player as its first member, so its owner.
 *
 * decisions/078-private-groups.md
 */
export async function createGroup(
  userId: string,
  name: string,
  now: Date
): Promise<GroupOutcome<{ groupId: number }>> {
  return inTransaction(async (tx) => {
    await lockPlayer(tx, userId);
    if ((await groupCountOf(tx, userId)) >= MAX_GROUPS) refuse("group-limit");
    const [group] = await tx
      .insert(gameGroup)
      .values({ name, inviteToken: newInviteToken(), createdAt: now })
      .returning({ id: gameGroup.id });
    if (group === undefined) throw new Error("Creating an Arvauspeli group returned no row");
    await tx.insert(gameGroupMember).values({ groupId: group.id, userId, joinedAt: now });
    return { groupId: group.id };
  });
}

/**
 * Joins the group a link names, joining the game first if the reader is not
 * yet playing: both are written, or neither. A member already in it joins
 * nothing and is answered `joined: false`.
 *
 * decisions/078-private-groups.md
 */
export async function joinGroup(
  userId: string,
  inviteToken: string,
  now: Date
): Promise<GroupOutcome<{ groupId: number; joined: boolean }>> {
  return inTransaction(async (tx) => {
    // Locked by its token, so a link renewed or a group deleted meanwhile is
    // read again once the lock is held, and found to name no group.
    const [group] = await tx
      .select({ id: gameGroup.id })
      .from(gameGroup)
      .where(eq(gameGroup.inviteToken, inviteToken))
      .for("update");
    if (group === undefined) refuse("invalid-link");
    const members = await membersOf(tx, group.id);
    if (members.some((member) => member.userId === userId)) {
      return { groupId: group.id, joined: false };
    }
    if (members.length >= MAX_MEMBERS) refuse("full");
    // The game is joined only once the group would take the reader, so a
    // refused join writes, and logs, no join of the game. A new player is in
    // no group, so only one already playing can still meet the limit.
    await joinGameIn(tx, userId, now);
    await lockPlayer(tx, userId);
    if ((await groupCountOf(tx, userId)) >= MAX_GROUPS) refuse("group-limit");
    await tx.insert(gameGroupMember).values({ groupId: group.id, userId, joinedAt: now });
    return { groupId: group.id, joined: true };
  });
}

/**
 * Takes the player out of a group. The member who joined next becomes the owner
 * by `ownerOf`, and the database deletes a group left empty.
 *
 * decisions/078-private-groups.md
 */
export async function leaveGroup(
  userId: string,
  groupId: number
): Promise<GroupOutcome<{ newOwnerId: string | null; emptied: boolean }>> {
  return inTransaction(async (tx) => {
    const members = await lockedMembers(tx, groupId);
    const own = memberIn(members, userId);
    await tx.delete(gameGroupMember).where(eq(gameGroupMember.id, own.membershipId));
    const rest = members.filter((member) => member !== own);
    const newOwner = ownerOf(members) === own ? ownerOf(rest) : null;
    return { newOwnerId: newOwner?.userId ?? null, emptied: rest.length === 0 };
  });
}

/**
 * The owner takes another member out of the group, by the membership's id.
 *
 * decisions/078-private-groups.md
 */
export async function removeMember(
  userId: string,
  groupId: number,
  membershipId: number
): Promise<GroupOutcome<{ removedUserId: string }>> {
  return inTransaction(async (tx) => {
    const members = await ownedMembers(tx, userId, groupId);
    const target =
      members.find((member) => member.membershipId === membershipId) ?? refuse("not-member");
    if (target.userId === userId) refuse("self");
    await tx.delete(gameGroupMember).where(eq(gameGroupMember.id, target.membershipId));
    return { removedUserId: target.userId };
  });
}

/**
 * The owner renames the group.
 *
 * decisions/078-private-groups.md
 */
export async function renameGroup(
  userId: string,
  groupId: number,
  name: string
): Promise<GroupOutcome<object>> {
  return inTransaction(async (tx) => {
    await ownedMembers(tx, userId, groupId);
    await tx.update(gameGroup).set({ name }).where(eq(gameGroup.id, groupId));
    return {};
  });
}

/**
 * The owner replaces the group's invite token, so the old link stops working.
 *
 * decisions/078-private-groups.md
 */
export async function renewInviteLink(
  userId: string,
  groupId: number
): Promise<GroupOutcome<object>> {
  return inTransaction(async (tx) => {
    await ownedMembers(tx, userId, groupId);
    await tx
      .update(gameGroup)
      .set({ inviteToken: newInviteToken() })
      .where(eq(gameGroup.id, groupId));
    return {};
  });
}

/**
 * The owner deletes the group; its memberships go with it. The balances are
 * untouched: they are the ledger's, not the group's.
 *
 * decisions/078-private-groups.md
 */
export async function deleteGroup(userId: string, groupId: number): Promise<GroupOutcome<object>> {
  return inTransaction(async (tx) => {
    await ownedMembers(tx, userId, groupId);
    await tx.delete(gameGroup).where(eq(gameGroup.id, groupId));
    return {};
  });
}

/**
 * A group as `Ryhmät` lists it: its name, its size, and the reader's rank in
 * it, or `null` with no guess this season or no season to rank.
 *
 * decisions/078-private-groups.md
 */
export type GroupSummary = { groupId: number; name: string; members: number; rank: number | null };

const finnish = new Intl.Collator("fi-FI");

function boardOf(
  entries: Awaited<ReturnType<typeof readBoardEntries>>,
  memberIds: ReadonlySet<string>,
  readerId: string
): Board {
  return rankBoard(
    entries.filter((entry) => memberIds.has(entry.userId)),
    readerId
  );
}

function userIdsOf(rows: ReadonlyArray<{ userId: string }>): string[] {
  return [...new Set(rows.map((row) => row.userId))];
}

/**
 * The groups a player belongs to, by name, each ranked by the season's
 * balances among its members: one read of every member of the player's groups.
 *
 * decisions/078-private-groups.md
 */
export async function readGroupsOf(
  userId: string,
  seasonId: number | null
): Promise<GroupSummary[]> {
  const mine = db
    .select({ groupId: gameGroupMember.groupId })
    .from(gameGroupMember)
    .where(eq(gameGroupMember.userId, userId));
  const rows = await db
    .select({ groupId: gameGroup.id, name: gameGroup.name, userId: gameGroupMember.userId })
    .from(gameGroupMember)
    .innerJoin(gameGroup, eq(gameGroup.id, gameGroupMember.groupId))
    .where(inArray(gameGroupMember.groupId, mine));
  if (rows.length === 0) return [];
  const entries = seasonId === null ? [] : await readBoardEntries(seasonId, userIdsOf(rows));
  const groups = new Map<number, { name: string; memberIds: Set<string> }>();
  for (const row of rows) {
    const group = groups.get(row.groupId) ?? { name: row.name, memberIds: new Set<string>() };
    group.memberIds.add(row.userId);
    groups.set(row.groupId, group);
  }
  return [...groups]
    .map(([groupId, { name, memberIds }]) => ({
      groupId,
      name,
      members: memberIds.size,
      rank: boardOf(entries, memberIds, userId).rows.find((row) => row.self)?.rank ?? null,
    }))
    .toSorted(
      (left, right) => finnish.compare(left.name, right.name) || left.groupId - right.groupId
    );
}

/**
 * One member of a group as its page lists them.
 *
 * decisions/078-private-groups.md
 */
export type GroupMember = {
  membershipId: number;
  nickname: string | null;
  self: boolean;
  owner: boolean;
};

/**
 * A group's page: its name, link, members by when they joined, and its board,
 * `null` with no season to rank.
 *
 * decisions/078-private-groups.md
 */
export type GroupPage = {
  groupId: number;
  name: string;
  inviteToken: string;
  members: GroupMember[];
  isOwner: boolean;
  board: Board | null;
  /** The members' guesses, `"error"` when they could not be read, `null` with no season. */
  guesses: MemberGuesses | "error" | null;
};

/**
 * One member's guess on a listed match, and once settled what it paid.
 *
 * decisions/079-group-members-guesses.md
 */
export type MemberGuess = {
  membershipId: number;
  nickname: string | null;
  self: boolean;
  guess: Guess;
  paid: Paid | null;
};

/**
 * A kicked-off match as `Jäsenten arvaukset` lists it: the result it was
 * settled against, if any, its members' guesses, and the models' guesses.
 *
 * decisions/079-group-members-guesses.md
 */
export type GroupMatch = {
  providerMatchId: number;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
  homeGoals: number | null;
  awayGoals: number | null;
  guesses: MemberGuess[];
  models: ModelGuess[];
};

/**
 * The matches a group's page lists, newest first, and whether there are more.
 *
 * decisions/079-group-members-guesses.md
 */
export type MemberGuesses = { matches: GroupMatch[]; more: boolean };

type MemberRow = { membershipId: number; userId: string; nickname: string | null };

/**
 * The members' guesses on the season's matches whose stored kickoff has passed,
 * the newest `shown` matches any member guessed. The kickoff rule is in the
 * query, so nothing before kickoff is ever read. Payments are read as the
 * player's own page reads them.
 *
 * decisions/079-group-members-guesses.md
 */
async function readMemberGuesses(
  members: readonly MemberRow[],
  readerId: string,
  seasonId: number,
  now: Date,
  shown: number
): Promise<MemberGuesses> {
  const ids = userIdsOf(members);
  // One snapshot, so a settlement committing between the reads cannot show a
  // settled guess as waiting, or its payment without its tier.
  const read = await db.transaction(
    async (tx) => {
      const page = await tx
        .select({
          providerMatchId: tasoMatches.providerMatchId,
          kickoffAt: tasoMatches.kickoffAt,
          homeTeamName: tasoMatches.homeTeamName,
          awayTeamName: tasoMatches.awayTeamName,
        })
        .from(gameGuess)
        .innerJoin(tasoMatches, eq(tasoMatches.providerMatchId, gameGuess.providerMatchId))
        .where(
          and(
            inArray(gameGuess.userId, ids),
            eq(gameGuess.seasonId, seasonId),
            lte(tasoMatches.kickoffAt, now)
          )
        )
        .groupBy(
          tasoMatches.providerMatchId,
          tasoMatches.kickoffAt,
          tasoMatches.homeTeamName,
          tasoMatches.awayTeamName
        )
        .orderBy(desc(tasoMatches.kickoffAt), desc(tasoMatches.providerMatchId))
        .limit(shown + 1);
      const listed = page.slice(0, shown);
      if (listed.length === 0) return null;
      const matchIds = listed.map((match) => match.providerMatchId);
      const guesses = await tx
        .select()
        .from(gameGuess)
        .where(and(inArray(gameGuess.userId, ids), inArray(gameGuess.providerMatchId, matchIds)));
      const [ledger, models] = await Promise.all([
        tx
          .select({ guessId: gameLedger.guessId, amount: gameLedger.amount, kind: gameLedger.kind })
          .from(gameLedger)
          .where(
            and(
              inArray(
                gameLedger.guessId,
                guesses.map((guess) => guess.id)
              ),
              inArray(gameLedger.kind, [...PAYMENT_KINDS])
            )
          ),
        readModelGuesses(tx, matchIds),
      ]);
      return { more: page.length > shown, listed, guesses, ledger, models };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
  if (read === null) return { matches: [], more: false };
  const { listed, guesses, ledger, models } = read;
  const payments = paymentsOf(ledger);
  const memberOf = new Map(members.map((member) => [member.userId, member]));
  return {
    matches: listed.map((match) => {
      const rows = guesses
        .filter((row) => row.providerMatchId === match.providerMatchId)
        .map((row) => ({
          row,
          // A guess is read only for the members passed in, so each has one.
          member: memberOf.get(row.userId) as MemberRow,
          result: settledResult(row),
        }))
        .toSorted((left, right) => left.member.membershipId - right.member.membershipId);
      const scored = rows.find(({ result }) => result !== null && result.homeGoals !== null);
      return {
        ...match,
        homeGoals: scored?.result?.homeGoals ?? null,
        awayGoals: scored?.result?.awayGoals ?? null,
        guesses: rows.map(({ row, member, result }) => ({
          membershipId: member.membershipId,
          nickname: member.nickname,
          self: member.userId === readerId,
          guess: storedGuess(row),
          paid:
            result === null
              ? null
              : {
                  settlement: result.settlement,
                  reward: payments.paid.get(row.id) ?? 0,
                  bonus: payments.bonuses.get(row.id) ?? 0,
                  modelsReward: payments.models.get(row.id) ?? 0,
                },
        })),
        models: models.get(match.providerMatchId) ?? [],
      };
    }),
    more: read.more,
  };
}

/**
 * A group's page for one of its members, or `null` when the reader is not one
 * or there is no such group: the two are answered alike.
 *
 * decisions/078-private-groups.md
 */
export async function readGroup(
  userId: string,
  groupId: number,
  seasonId: number | null,
  listing: { now: Date; shown: number }
): Promise<GroupPage | null> {
  const rows = await db
    .select({
      membershipId: gameGroupMember.id,
      userId: gameGroupMember.userId,
      nickname: userNickname.nickname,
      name: gameGroup.name,
      inviteToken: gameGroup.inviteToken,
    })
    .from(gameGroupMember)
    .innerJoin(gameGroup, eq(gameGroup.id, gameGroupMember.groupId))
    .leftJoin(userNickname, eq(userNickname.userId, gameGroupMember.userId))
    .where(eq(gameGroupMember.groupId, groupId));
  const self = rows.find((row) => row.userId === userId);
  if (self === undefined) return null;
  const owner = ownerOf(rows);
  const [board, guesses] =
    seasonId === null
      ? [null, null]
      : await Promise.all([
          readBoardEntries(seasonId, userIdsOf(rows)).then((entries) =>
            boardOf(entries, new Set(userIdsOf(rows)), userId)
          ),
          readMemberGuesses(rows, userId, seasonId, listing.now, listing.shown).catch(
            (error: unknown) => {
              logger.error(
                { err: error, userId, groupId },
                "Reading Arvauspeli members' guesses failed"
              );
              return "error" as const;
            }
          ),
        ]);
  return {
    groupId,
    name: self.name,
    inviteToken: self.inviteToken,
    members: rows
      .toSorted((left, right) => left.membershipId - right.membershipId)
      .map((row) => ({
        membershipId: row.membershipId,
        nickname: row.nickname,
        self: row === self,
        owner: row === owner,
      })),
    isOwner: self === owner,
    board,
    guesses,
  };
}

/**
 * What an invite link shows: the group's name and size, and for a signed-in
 * reader whether they are already in it and whether they play yet. `null` for
 * a link that names no group.
 *
 * decisions/078-private-groups.md
 */
export type Invite = {
  groupId: number;
  name: string;
  members: number;
  member: boolean;
  player: boolean;
};

export async function readInvite(
  userId: string | null,
  inviteToken: string
): Promise<Invite | null> {
  const [group] = await db
    .select({ groupId: gameGroup.id, name: gameGroup.name })
    .from(gameGroup)
    .where(eq(gameGroup.inviteToken, inviteToken));
  if (group === undefined) return null;
  const [members, own, player] = await Promise.all([
    db
      .select({ members: count() })
      .from(gameGroupMember)
      .where(eq(gameGroupMember.groupId, group.groupId)),
    userId === null
      ? []
      : db
          .select({ id: gameGroupMember.id })
          .from(gameGroupMember)
          .where(
            and(eq(gameGroupMember.groupId, group.groupId), eq(gameGroupMember.userId, userId))
          ),
    userId === null
      ? []
      : db
          .select({ userId: gamePlayer.userId })
          .from(gamePlayer)
          .where(eq(gamePlayer.userId, userId)),
  ]);
  return {
    ...group,
    members: members[0]?.members ?? 0,
    member: own.length > 0,
    player: player.length > 0,
  };
}
