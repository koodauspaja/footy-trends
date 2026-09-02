import { describe, expect, it } from "vitest";
import { isStoredInteger, MAX_STORED_INTEGER } from "@/lib/provider-ids";

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
