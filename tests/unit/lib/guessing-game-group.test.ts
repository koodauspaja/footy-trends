import { describe, expect, it } from "vitest";
import {
  checkGroupName,
  isInviteToken,
  isRowId,
  newInviteToken,
  ownerOf,
  parseGroupId,
} from "@/lib/guessing-game-group";

/**
 * A private group's rules: its name at each boundary, its token's shape, the
 * ids a browser or a URL may send, and who owns it.
 *
 * decisions/078-private-groups.md
 */

describe("checkGroupName", () => {
  it("stores a name trimmed, with its runs of spaces collapsed", () => {
    expect(checkGroupName("  Lauantain   porukka ")).toEqual({
      ok: true,
      name: "Lauantain porukka",
    });
  });

  it.each([
    ["ab", false],
    ["abc", true],
    ["a".repeat(30), true],
    ["a".repeat(31), false],
  ])("takes %s by its length: %s", (name, ok) => {
    expect(checkGroupName(name).ok).toBe(ok);
  });

  it("counts a letter typed as one character as one", () => {
    expect(checkGroupName("ää")).toEqual({ ok: false, reason: "name-length" });
    expect(checkGroupName("äää")).toEqual({ ok: true, name: "äää" });
  });

  it("refuses a name typed far past the limit before any work", () => {
    expect(checkGroupName(" ".repeat(301))).toEqual({ ok: false, reason: "name-length" });
  });

  it("refuses a character a nickname may not have", () => {
    expect(checkGroupName("Kaverit!")).toEqual({ ok: false, reason: "name-characters" });
  });

  it("refuses a listed word as a word of its own, not inside a longer one", () => {
    expect(checkGroupName("Iso paska")).toEqual({ ok: false, reason: "word-list" });
    expect(checkGroupName("Paskahousut")).toEqual({ ok: true, name: "Paskahousut" });
  });
});

describe("the invite token", () => {
  it("is 43 characters of base64url, and new each time", () => {
    const token = newInviteToken();
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(newInviteToken()).not.toBe(token);
    expect(isInviteToken(token)).toBe(true);
  });

  it.each([["a".repeat(42)], ["a".repeat(44)], [`${"a".repeat(42)}+`], [43], [null]])(
    "refuses %s as a token",
    (value) => {
      expect(isInviteToken(value)).toBe(false);
    }
  );
});

describe("ids", () => {
  it.each([
    [1, true],
    [2_147_483_647, true],
    [2_147_483_648, false],
    [0, false],
    [1.5, false],
    ["1", false],
  ])("takes %s as a row id: %s", (value, ok) => {
    expect(isRowId(value)).toBe(ok);
  });

  it.each([
    ["12", 12],
    ["012", null],
    ["0", null],
    ["-1", null],
    ["1e3", null],
    ["2147483648", null],
    ["12345678901", null],
  ])("parses the URL's %s as %s", (segment, id) => {
    expect(parseGroupId(segment)).toBe(id);
  });
});

describe("ownerOf", () => {
  it("is the membership with the lowest id, whatever the order", () => {
    expect(ownerOf([{ membershipId: 7 }, { membershipId: 3 }, { membershipId: 5 }])).toEqual({
      membershipId: 3,
    });
  });

  it("is null for a group with no members", () => {
    expect(ownerOf([])).toBeNull();
  });
});
