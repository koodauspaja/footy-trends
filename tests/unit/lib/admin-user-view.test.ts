import { describe, expect, it } from "vitest";
import { pageCount, pageFrom, USERS_PER_PAGE, windowFor } from "@/lib/admin-user-view";

/**
 * The page arithmetic, from specs/028-admin-tools-and-roles.md.
 *
 * `pageFrom` reads an attacker-controlled query parameter, so it is tested from
 * both sides of the boundary — the parser class in `skills/self-review.md`,
 * where `Number("0x10")` being 16 is the usual way this goes wrong.
 */
describe("pageFrom", () => {
  it("reads a page number", () => {
    expect(pageFrom("3")).toBe(3);
  });

  it.each([
    ["nothing at all", undefined],
    ["an empty string", ""],
    ["zero", "0"],
    ["a negative", "-2"],
    ["a decimal", "1.5"],
    ["hex, which Number() would accept as 16", "0x10"],
    ["exponent notation", "1e3"],
    ["trailing rubbish, which parseInt would accept as 2", "2abc"],
    ["leading space", " 2"],
    ["a repeated parameter", ["2", "5"]],
  ])("treats %s as page one", (_case, raw) => {
    expect(pageFrom(raw as string | string[] | undefined)).toBe(1);
  });

  it("does not accept a page that is not a safe integer", () => {
    expect(pageFrom("99999999999999999999")).toBe(1);
  });
});

describe("pageCount", () => {
  it("is one for an empty table, so the controls can say 'Sivu 1 / 1'", () => {
    expect(pageCount(0)).toBe(1);
  });

  it.each([
    [1, 1],
    [USERS_PER_PAGE, 1],
    [USERS_PER_PAGE + 1, 2],
    [USERS_PER_PAGE * 2, 2],
    [USERS_PER_PAGE * 2 + 1, 3],
  ])("needs %i users to fill %i page(s)", (total, expected) => {
    // The boundary from both sides: exactly full, and one over.
    expect(pageCount(total)).toBe(expected);
  });
});

describe("windowFor", () => {
  it("starts the first page at the beginning", () => {
    expect(windowFor(1, 173)).toEqual({ limit: USERS_PER_PAGE, offset: 0 });
  });

  it("offsets by whole pages", () => {
    expect(windowFor(3, 173)).toEqual({ limit: USERS_PER_PAGE, offset: USERS_PER_PAGE * 2 });
  });

  it("clamps past the end to the last page", () => {
    // Asking for page nine of four reads page four rather than an empty window.
    expect(windowFor(9, USERS_PER_PAGE * 4)).toEqual({
      limit: USERS_PER_PAGE,
      offset: USERS_PER_PAGE * 3,
    });
  });

  it("clamps below one to the first page", () => {
    expect(windowFor(0, 173).offset).toBe(0);
    expect(windowFor(-5, 173).offset).toBe(0);
  });

  it("stays on page one for an empty table", () => {
    expect(windowFor(4, 0)).toEqual({ limit: USERS_PER_PAGE, offset: 0 });
  });
});
