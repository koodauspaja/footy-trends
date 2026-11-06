"use server";

import { currentUserId } from "@/lib/current-user";
import {
  checkGroupName,
  type GroupNameRefusal,
  isInviteToken,
  isRowId,
} from "@/lib/guessing-game-group";
import {
  createGroup,
  deleteGroup,
  type GroupOutcome,
  type GroupRefusal,
  joinGroup,
  leaveGroup,
  removeMember,
  renameGroup,
  renewInviteLink,
} from "@/lib/guessing-game-group-store";
import { logger } from "@/lib/logger";

/**
 * `Arvauspeli`'s group actions. Every id, token and name comes from the
 * browser, so each is parsed here, and the session, membership and ownership
 * are checked on the server whatever the page showed.
 *
 * decisions/078-private-groups.md
 */

/**
 * Why a group action was not done, as the page says it. `stale` is a page that
 * no longer matches the group, a member removed or a group deleted meanwhile:
 * the page reloads. Anything else reads as a failure to retry.
 *
 * decisions/078-private-groups.md
 */
export type GroupActionRefusal =
  | GroupNameRefusal
  | "full"
  | "group-limit"
  | "invalid-link"
  | "stale"
  | "failed";

export type GroupActionRefused = { ok: false; reason: GroupActionRefusal };

/**
 * What a group action answers: done, with what the page needs next, a new
 * group's id for one; or refused.
 *
 * decisions/078-private-groups.md
 */
export type GroupActionResult<R extends object = object> = ({ ok: true } & R) | GroupActionRefused;

const SHOWN: Readonly<Record<GroupRefusal | GroupNameRefusal, GroupActionRefusal>> = {
  "name-length": "name-length",
  "name-characters": "name-characters",
  "word-list": "word-list",
  "not-player": "failed",
  full: "full",
  "group-limit": "group-limit",
  "invalid-link": "invalid-link",
  "not-member": "stale",
  "not-owner": "stale",
  self: "failed",
};

type Context = { groupId?: number };

function refused(
  userId: string,
  context: Context,
  reason: GroupRefusal | GroupNameRefusal
): GroupActionRefused {
  logger.info({ userId, ...context, reason }, "Arvauspeli group refused");
  return { ok: false, reason: SHOWN[reason] };
}

/**
 * Runs one group write for the signed-in reader: no session, input that does
 * not parse, or a failed write answers `failed`; a refusal is logged and
 * answered as the page shows it; a done write logs its own line.
 *
 * decisions/078-private-groups.md
 */
async function act<T extends object, R extends object>(
  action: string,
  context: Context,
  write: (userId: string) => Promise<GroupOutcome<T> | { ok: false; reason: GroupNameRefusal }>,
  done: (userId: string, result: T) => R
): Promise<GroupActionResult<R>> {
  let userId: string | null = null;
  try {
    userId = await currentUserId();
    if (userId === null) {
      logger.warn({ action }, "Arvauspeli group action refused: no session");
      return { ok: false, reason: "failed" };
    }
    const outcome = await write(userId);
    if (!outcome.ok) return refused(userId, context, outcome.reason);
    return { ok: true, ...done(userId, outcome) };
  } catch (error) {
    logger.error({ err: error, userId, ...context, action }, "An Arvauspeli group action failed");
    return { ok: false, reason: "failed" };
  }
}

function notParsed(action: string): GroupActionRefused {
  logger.warn({ action }, "Arvauspeli group action refused: not parsed");
  return { ok: false, reason: "failed" };
}

/**
 * A write that takes a group's name, done only once the name passes its rules.
 *
 * decisions/078-private-groups.md
 */
async function named<T extends object>(
  raw: string,
  write: (name: string) => Promise<GroupOutcome<T>>
): Promise<GroupOutcome<T> | { ok: false; reason: GroupNameRefusal }> {
  const checked = checkGroupName(raw);
  return checked.ok ? write(checked.name) : checked;
}

/**
 * Creates a group with the signed-in player as its owner.
 *
 * decisions/078-private-groups.md
 */
export async function createGroupAction(
  rawName: unknown
): Promise<GroupActionResult<{ groupId: number }>> {
  if (typeof rawName !== "string") return notParsed("create");
  return act(
    "create",
    {},
    (userId) => named(rawName, (name) => createGroup(userId, name, new Date())),
    (userId, { groupId }) => {
      logger.info({ userId, groupId }, "Arvauspeli group created");
      return { groupId };
    }
  );
}

/**
 * Joins the group an invite link names, and the game with it if need be.
 *
 * decisions/078-private-groups.md
 */
export async function joinGroupAction(
  token: unknown
): Promise<GroupActionResult<{ groupId: number }>> {
  if (!isInviteToken(token)) return notParsed("join");
  return act(
    "join",
    {},
    (userId) => joinGroup(userId, token, new Date()),
    (userId, { groupId, joined }) => {
      if (joined) logger.info({ userId, groupId }, "Arvauspeli group joined");
      return { groupId };
    }
  );
}

/**
 * Takes the signed-in player out of a group.
 *
 * decisions/078-private-groups.md
 */
export async function leaveGroupAction(groupId: unknown): Promise<GroupActionResult> {
  if (!isRowId(groupId)) return notParsed("leave");
  return act(
    "leave",
    { groupId },
    (userId) => leaveGroup(userId, groupId),
    (userId, { newOwnerId, emptied }) => {
      logger.info({ userId, groupId, emptied }, "Arvauspeli group left");
      if (newOwnerId !== null) {
        logger.info({ userId, groupId, newOwnerId }, "Arvauspeli group ownership passed");
      }
      return {};
    }
  );
}

/**
 * The owner takes a member out of the group, named by their membership.
 *
 * decisions/078-private-groups.md
 */
export async function removeMemberAction(
  groupId: unknown,
  membershipId: unknown
): Promise<GroupActionResult> {
  if (!isRowId(groupId) || !isRowId(membershipId)) return notParsed("remove");
  return act(
    "remove",
    { groupId },
    (userId) => removeMember(userId, groupId, membershipId),
    (userId, { removedUserId }) => {
      logger.info({ userId, groupId, removedUserId }, "Arvauspeli group member removed");
      return {};
    }
  );
}

/**
 * The owner renames the group.
 *
 * decisions/078-private-groups.md
 */
export async function renameGroupAction(
  groupId: unknown,
  rawName: unknown
): Promise<GroupActionResult> {
  if (!isRowId(groupId) || typeof rawName !== "string") return notParsed("rename");
  return act(
    "rename",
    { groupId },
    (userId) => named(rawName, (name) => renameGroup(userId, groupId, name)),
    (userId) => {
      logger.info({ userId, groupId }, "Arvauspeli group renamed");
      return {};
    }
  );
}

/**
 * The owner renews the invite link, so the old one stops working.
 *
 * decisions/078-private-groups.md
 */
export async function renewInviteLinkAction(groupId: unknown): Promise<GroupActionResult> {
  if (!isRowId(groupId)) return notParsed("renew");
  return act(
    "renew",
    { groupId },
    (userId) => renewInviteLink(userId, groupId),
    (userId) => {
      logger.info({ userId, groupId }, "Arvauspeli group link renewed");
      return {};
    }
  );
}

/**
 * The owner deletes the group.
 *
 * decisions/078-private-groups.md
 */
export async function deleteGroupAction(groupId: unknown): Promise<GroupActionResult> {
  if (!isRowId(groupId)) return notParsed("delete");
  return act(
    "delete",
    { groupId },
    (userId) => deleteGroup(userId, groupId),
    (userId) => {
      logger.info({ userId, groupId }, "Arvauspeli group deleted");
      return {};
    }
  );
}
