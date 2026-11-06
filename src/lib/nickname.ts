/**
 * A nickname's rules, apart from any I/O: how one is normalised, what it may
 * hold, and which words it may not contain.
 *
 * decisions/077-nickname.md
 */

import { ENGLISH_ENTRIES, FINNISH_ENTRIES } from "./nickname-word-list";

export const MIN_NICKNAME_LENGTH = 3;
export const MAX_NICKNAME_LENGTH = 20;
const MAX_RAW_LENGTH = 200;

/**
 * Latin letters, digits 0–9, spaces, `-`, `_` and `.`: Latin only, so a
 * Cyrillic `а` cannot pass for an `a` beside a name that is taken.
 *
 * decisions/077-nickname.md
 */
const ALLOWED = /^[\p{Script=Latin}0-9 ._-]+$/u;

/**
 * Anything that is not a letter or a digit ends a word.
 *
 * decisions/077-nickname.md
 */
const WORD_BREAK = /[^\p{L}\p{N}]+/u;

/**
 * Whether a normalised name holds only the characters a nickname may: a group's
 * name in `Arvauspeli` is held to the same.
 *
 * decisions/077-nickname.md
 * decisions/078-private-groups.md
 */
export function hasAllowedCharacters(name: string): boolean {
  return ALLOWED.test(name);
}

export type NicknameRefusal = "length" | "characters" | "word-list";

export type NicknameCheck =
  | { ok: true; nickname: string; key: string }
  | { ok: true; nickname: null }
  | { ok: false; reason: NicknameRefusal };

/**
 * A nickname as it is stored: compatibility-normalised, so a full-width `Ａ`
 * is an `A`, its ends trimmed and its runs of spaces collapsed to one.
 *
 * decisions/077-nickname.md
 */
export function normaliseNickname(raw: string): string {
  return raw.normalize("NFKC").trim().replaceAll(/ {2,}/g, " ");
}

/**
 * What two nicknames are compared by: case is ignored. Upper-cased first, so
 * `ß` folds to `ss` as it would under Unicode case folding, which JavaScript lacks.
 *
 * decisions/077-nickname.md
 */
export function nicknameKey(nickname: string): string {
  return nickname.toUpperCase().toLowerCase();
}

function wordsOf(text: string): string[] {
  // Normalised as a nickname is, so a listed entry and a name compare alike.
  return nicknameKey(text.normalize("NFKC"))
    .split(WORD_BREAK)
    .filter((word) => word !== "");
}

/**
 * Each listed entry as its words. An entry with none, such as an emoji, can
 * match nothing and is left out.
 *
 * decisions/077-nickname.md
 */
const BLOCKED: readonly (readonly string[])[] = [...FINNISH_ENTRIES, ...ENGLISH_ENTRIES]
  .map(wordsOf)
  .filter((words) => words.length > 0);

function containsRun(words: readonly string[], run: readonly string[]): boolean {
  for (let start = 0; start + run.length <= words.length; start += 1) {
    if (run.every((word, offset) => words[start + offset] === word)) return true;
  }
  return false;
}

/**
 * Whether a nickname contains a listed entry as whole words, one or several in
 * a row, ignoring case. A listed word inside a longer one does not count.
 *
 * decisions/077-nickname.md
 */
export function hasBlockedWord(nickname: string): boolean {
  const words = wordsOf(nickname);
  return BLOCKED.some((entry) => containsRun(words, entry));
}

/**
 * A nickname as the browser sent it, checked: the stored form and its key, an
 * empty field's `null`, which removes the nickname, or the first rule it breaks.
 *
 * decisions/077-nickname.md
 */
export function checkNickname(raw: string): NicknameCheck {
  // A bound before any work: no nickname of 20 characters is typed as 200.
  if (raw.length > MAX_RAW_LENGTH) return { ok: false, reason: "length" };
  const nickname = normaliseNickname(raw);
  if (nickname === "") return { ok: true, nickname: null };
  // Code points, not UTF-16 units: `ä` typed as one character is one.
  const { length } = [...nickname];
  if (length < MIN_NICKNAME_LENGTH || length > MAX_NICKNAME_LENGTH) {
    return { ok: false, reason: "length" };
  }
  if (!hasAllowedCharacters(nickname)) return { ok: false, reason: "characters" };
  if (hasBlockedWord(nickname)) return { ok: false, reason: "word-list" };
  return { ok: true, nickname, key: nicknameKey(nickname) };
}
