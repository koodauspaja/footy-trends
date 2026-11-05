import { describe, expect, it } from "vitest";
import {
  checkNickname,
  hasBlockedWord,
  MAX_NICKNAME_LENGTH,
  MIN_NICKNAME_LENGTH,
  nicknameKey,
  normaliseNickname,
} from "@/lib/nickname";
import { ENGLISH_ENTRIES, FINNISH_ENTRIES } from "@/lib/nickname-word-list";

/**
 * A nickname's rules: normalising, length, characters, and the word list.
 *
 * decisions/077-nickname.md
 */

describe("normaliseNickname", () => {
  it("trims the ends and collapses runs of spaces", () => {
    expect(normaliseNickname("  Kalle   Kukko ")).toBe("Kalle Kukko");
  });

  it("folds compatibility forms, a full-width letter and a no-break space", () => {
    expect(normaliseNickname("Ｋalle Kukko")).toBe("Kalle Kukko");
  });

  it("composes a letter typed with a combining mark", () => {
    expect(normaliseNickname("Pää")).toBe("Pää");
  });
});

describe("nicknameKey", () => {
  it("ignores case, accented letters included", () => {
    expect(nicknameKey("ÄIJÄ Kukko")).toBe(nicknameKey("äijä kukko"));
  });
});

describe("checkNickname", () => {
  it("returns the stored form and its key", () => {
    expect(checkNickname("  Kalle   Kukko ")).toEqual({
      ok: true,
      nickname: "Kalle Kukko",
      key: "kalle kukko",
    });
  });

  it("reads an empty field, or one of spaces only, as removing the nickname", () => {
    expect(checkNickname("")).toEqual({ ok: true, nickname: null });
    expect(checkNickname("    ")).toEqual({ ok: true, nickname: null });
  });

  it.each([
    ["two characters", "ab", false],
    ["three characters", "abc", true],
    ["twenty characters", "a".repeat(MAX_NICKNAME_LENGTH), true],
    ["twenty-one characters", "a".repeat(MAX_NICKNAME_LENGTH + 1), false],
  ])("judges %s by its length", (_label, raw, ok) => {
    expect(checkNickname(raw).ok).toBe(ok);
    if (!ok) expect(checkNickname(raw)).toEqual({ ok: false, reason: "length" });
  });

  it("counts the length after normalising", () => {
    expect(checkNickname(`  ${"a".repeat(MIN_NICKNAME_LENGTH)}   `).ok).toBe(true);
    expect(checkNickname("  ab     ")).toEqual({ ok: false, reason: "length" });
    expect(checkNickname("a     b")).toMatchObject({ ok: true, nickname: "a b" });
  });

  it("counts a letter outside the basic plane as one character, not two", () => {
    // U+1DF00, a Latin letter NFKC leaves alone: two UTF-16 units each.
    const letter = "\u{1DF00}";
    expect(letter).toHaveLength(2);
    expect(checkNickname(letter.repeat(MAX_NICKNAME_LENGTH)).ok).toBe(true);
  });

  it("refuses input far past any nickname before normalising it", () => {
    expect(checkNickname(`${" ".repeat(201)}abc`)).toEqual({ ok: false, reason: "length" });
    expect(checkNickname(`${" ".repeat(197)}abc`).ok).toBe(true);
  });

  it.each([
    ["Finnish letters", "Åke Pöllö"],
    ["other accented Latin letters", "Zoë Señor"],
    ["digits", "Kalle99"],
    ["a hyphen, an underscore and a full stop", "K-a_l.e"],
  ])("allows %s", (_label, raw) => {
    expect(checkNickname(raw).ok).toBe(true);
  });

  it.each([
    ["an emoji", "Kalle ⚽"],
    ["an at sign", "@kalle"],
    ["an exclamation mark", "Kalle!"],
    ["a Cyrillic letter that looks Latin", "Kаlle"],
    ["a tab inside", "Kal\tle"],
  ])("refuses %s", (_label, raw) => {
    expect(checkNickname(raw)).toEqual({ ok: false, reason: "characters" });
  });

  it("refuses a listed word, naming only the reason", () => {
    expect(checkNickname("Iso_Paska")).toEqual({ ok: false, reason: "word-list" });
  });

  it("checks the length before the characters, and both before the list", () => {
    expect(checkNickname("@!")).toEqual({ ok: false, reason: "length" });
    expect(checkNickname("paska!")).toEqual({ ok: false, reason: "characters" });
  });
});

describe("hasBlockedWord", () => {
  it("finds a Finnish entry as a word of its own, in any case", () => {
    expect(FINNISH_ENTRIES).toContain("paska");
    expect(hasBlockedWord("Iso PASKA")).toBe(true);
    expect(hasBlockedWord("iso.paska")).toBe(true);
  });

  it("finds an English entry", () => {
    expect(ENGLISH_ENTRIES).toContain("ass");
    expect(hasBlockedWord("Big ass")).toBe(true);
  });

  it("finds an entry of several words only as those words in a row", () => {
    expect(FINNISH_ENTRIES).toContain("alfred nussi");
    expect(hasBlockedWord("Alfred_Nussi")).toBe(true);
    expect(hasBlockedWord("Alfred ja Nussi")).toBe(false);
  });

  it("matches the last word of a name, not only the first", () => {
    expect(hasBlockedWord("Kalle ass")).toBe(true);
  });

  it("does not find an entry inside a longer word", () => {
    expect(hasBlockedWord("Paskahousu")).toBe(false);
    expect(hasBlockedWord("Bass")).toBe(false);
    expect(hasBlockedWord("Scunthorpe")).toBe(false);
  });

  it("does not let an entry of no words, an emoji, match everything", () => {
    expect(ENGLISH_ENTRIES).toContain("🖕");
    expect(hasBlockedWord("Kalle Kukko")).toBe(false);
  });

  it("splits an entry at its symbols as it splits a name", () => {
    expect(ENGLISH_ENTRIES).toContain("s&m");
    expect(hasBlockedWord("Kalle S M")).toBe(true);
  });
});
