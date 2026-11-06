/**
 * A private group's rules in `Arvauspeli`, apart from any I/O: its limits, its
 * name, its invite token and who owns it.
 *
 * decisions/078-private-groups.md
 */

import { randomBytes } from "node:crypto";
import { hasAllowedCharacters, hasBlockedWord, normaliseNickname } from "./nickname";

/**
 * How many groups a player can belong to, owned or joined.
 *
 * decisions/078-private-groups.md
 */
export const MAX_GROUPS = 10;
/**
 * How many members a group can have: the size of the public board's top list.
 *
 * decisions/078-private-groups.md
 */
export const MAX_MEMBERS = 50;

export const MIN_GROUP_NAME_LENGTH = 3;
export const MAX_GROUP_NAME_LENGTH = 30;
const MAX_RAW_LENGTH = 300;

export type GroupNameRefusal = "name-length" | "name-characters" | "word-list";

export type GroupNameCheck = { ok: true; name: string } | { ok: false; reason: GroupNameRefusal };

/**
 * A group's name as the browser sent it, checked as a nickname is: its stored
 * form, or the first rule it breaks. Names need not be unique.
 *
 * decisions/078-private-groups.md
 */
export function checkGroupName(raw: string): GroupNameCheck {
  // A bound before any work: no name of 30 characters is typed as 300.
  if (raw.length > MAX_RAW_LENGTH) return { ok: false, reason: "name-length" };
  const name = normaliseNickname(raw);
  const { length } = [...name];
  if (length < MIN_GROUP_NAME_LENGTH || length > MAX_GROUP_NAME_LENGTH) {
    return { ok: false, reason: "name-length" };
  }
  if (!hasAllowedCharacters(name)) return { ok: false, reason: "name-characters" };
  if (hasBlockedWord(name)) return { ok: false, reason: "word-list" };
  return { ok: true, name };
}

/**
 * A new invite token: 32 random bytes, so a link cannot be guessed.
 *
 * decisions/078-private-groups.md
 */
export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

const TOKEN = /^[\w-]{43}$/;

/**
 * Whether a link's token has the shape `newInviteToken` gives, checked before
 * anything is read.
 *
 * decisions/078-private-groups.md
 */
export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

/**
 * The largest `serial`: a larger id would fail in Postgres, not miss.
 *
 * decisions/078-private-groups.md
 */
const MAX_ROW_ID = 2_147_483_647;

/**
 * Whether a value from the browser or a URL can be a stored row's id.
 *
 * decisions/078-private-groups.md
 */
export function isRowId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= MAX_ROW_ID;
}

/**
 * A group id from its page's URL, or `null` for anything else.
 *
 * decisions/078-private-groups.md
 */
export function parseGroupId(segment: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(segment)) return null;
  const id = Number(segment);
  return isRowId(id) ? id : null;
}

/**
 * A group's owner among its memberships: the one who joined earliest, by the
 * lowest membership id, so it passes on by itself when the owner leaves.
 *
 * decisions/078-private-groups.md
 */
export function ownerOf<T extends { membershipId: number }>(members: readonly T[]): T | null {
  let owner: T | null = null;
  for (const member of members) {
    if (owner === null || member.membershipId < owner.membershipId) owner = member;
  }
  return owner;
}

/**
 * How many matches a group's `Jäsenten arvaukset` shows at a time.
 *
 * decisions/079-group-members-guesses.md
 */
export const MATCHES_SHOWN = 10;

/**
 * The most matches one view lists: more than a season has.
 *
 * decisions/079-group-members-guesses.md
 */
const MAX_MATCHES_SHOWN = 200;

/**
 * How many matches a group's page lists, from its `ottelut` search parameter:
 * ten more each time "Näytä aiemmat ottelut" is followed. Anything not a whole
 * step of ten up to 200 is the first ten.
 *
 * decisions/079-group-members-guesses.md
 */
export function parseMatchesShown(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^[1-9]\d{1,2}$/.test(value)) return MATCHES_SHOWN;
  const shown = Number(value);
  return shown % MATCHES_SHOWN === 0 && shown <= MAX_MATCHES_SHOWN ? shown : MATCHES_SHOWN;
}
