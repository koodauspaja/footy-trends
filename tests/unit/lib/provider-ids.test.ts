import { describe, expect, it } from "vitest";
import { isStoredInteger, MAX_STORED_INTEGER, parseWholeNumber } from "@/lib/provider-ids";

describe("isStoredInteger", () => {
  it("accepts the ids and seasons our columns actually hold", () => {
    expect(isStoredInteger(0)).toBe(true);
    expect(isStoredInteger(4036979)).toBe(true);
    expect(isStoredInteger(2026)).toBe(true);
    expect(isStoredInteger(MAX_STORED_INTEGER)).toBe(true);
  });

  it("refuses anything past the 32-bit column, which fails at bind time", () => {
    // Postgres promotes the column when comparing against a literal this large,
    // so the failure is in the bound parameter rather than in the SQL — which
    // is why the check has to live here.
    expect(isStoredInteger(MAX_STORED_INTEGER + 1)).toBe(false);
    expect(isStoredInteger(99999999999)).toBe(false);
    expect(isStoredInteger(Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it("refuses what is not a whole, non-negative number", () => {
    expect(isStoredInteger(-1)).toBe(false);
    expect(isStoredInteger(1.5)).toBe(false);
    expect(isStoredInteger(Number.NaN)).toBe(false);
    expect(isStoredInteger(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("parseWholeNumber (#529)", () => {
  it("reads decimal digits as the number they spell", () => {
    expect(parseWholeNumber("16")).toBe(16);
    expect(parseWholeNumber("0")).toBe(0);
    expect(parseWholeNumber("007")).toBe(7);
    expect(parseWholeNumber(String(MAX_STORED_INTEGER))).toBe(MAX_STORED_INTEGER);
  });

  it.each([
    ["hexadecimal, which Number() reads as 16", "0x10"],
    ["exponent notation, which Number() reads as 1000", "1e3"],
    ["a sign", "-1"],
    ["a plus sign", "+1"],
    ["a fraction", "1.5"],
    ["empty, which Number() reads as 0", ""],
    ["blank, which Number() reads as 0", " "],
    ["padded, which Number() reads as 7", " 7 "],
    ["digits and more", "12abc"],
    ["a word", "abc"],
    ["one past the column's limit", String(MAX_STORED_INTEGER + 1)],
    ["three hundred digits, which Number() reads as Infinity", "9".repeat(300)],
  ])("refuses %s", (_name, raw) => {
    expect(parseWholeNumber(raw)).toBeNull();
  });

  it("refuses what is not text: a repeated parameter, an absent one, a number", () => {
    expect(parseWholeNumber(["16"])).toBeNull();
    expect(parseWholeNumber(undefined)).toBeNull();
    expect(parseWholeNumber(null)).toBeNull();
    expect(parseWholeNumber(16)).toBeNull();
  });
});
