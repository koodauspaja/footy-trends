import { describe, expect, it } from "vitest";
import { listSelectableRounds, parseRoundParam, resolveCurrentRound } from "@/lib/rounds";

/**
 * A league's rounds: which are selectable, how the `kierros` parameter is read,
 * and the current round.
 *
 * decisions/003-standings-after-selected-round.md
 * decisions/005-listing-matches-for-selected-season.md
 */

describe("listSelectableRounds", () => {
  it("lists every round from 1 to the highest known matchday", () => {
    expect(listSelectableRounds(3)).toEqual([1, 2, 3]);
  });

  it("returns an empty list when no matchday is known", () => {
    expect(listSelectableRounds(null)).toEqual([]);
  });

  it("returns an empty list for a non-positive matchday", () => {
    expect(listSelectableRounds(0)).toEqual([]);
  });
});

describe("parseRoundParam", () => {
  it("reports an absent parameter", () => {
    expect(parseRoundParam(undefined, 10)).toEqual({ kind: "absent" });
  });

  it("treats an empty value as absent, matching the 'Koko kausi' option", () => {
    expect(parseRoundParam("", 10)).toEqual({ kind: "absent" });
  });

  it("accepts a round within the known range", () => {
    expect(parseRoundParam("5", 10)).toEqual({ kind: "valid", round: 5 });
  });

  it("accepts the highest known round", () => {
    expect(parseRoundParam("10", 10)).toEqual({ kind: "valid", round: 10 });
  });

  it("rejects a round beyond the highest known matchday", () => {
    expect(parseRoundParam("11", 10)).toEqual({ kind: "invalid" });
  });

  it("rejects zero and negative values", () => {
    expect(parseRoundParam("0", 10)).toEqual({ kind: "invalid" });
    expect(parseRoundParam("-1", 10)).toEqual({ kind: "invalid" });
  });

  it("rejects non-numeric and malformed values", () => {
    // The last three are 5 to `Number()`, a round within the range.
    for (const value of ["abc", "5abc", "2147483648", "5.0", " 5", "0x5", "5e0"]) {
      expect(parseRoundParam(value, 10)).toEqual({ kind: "invalid" });
    }
  });

  it("rejects a repeated parameter", () => {
    expect(parseRoundParam(["5", "6"], 10)).toEqual({ kind: "invalid" });
  });

  it("rejects any round when no matchday is known for the season", () => {
    expect(parseRoundParam("1", null)).toEqual({ kind: "invalid" });
  });
});

describe("resolveCurrentRound", () => {
  it("returns the matchday of the chronologically earliest unfinished match", () => {
    const matches = [
      { status: "SCHEDULED", matchday: 3, kickoffAt: new Date("2025-09-15") },
      { status: "SCHEDULED", matchday: 2, kickoffAt: new Date("2025-09-08") },
      { status: "FINISHED", matchday: 1, kickoffAt: new Date("2025-09-01") },
    ];

    expect(resolveCurrentRound(matches, 3)).toBe(2);
  });

  it("returns the highest matchday when every match is finished", () => {
    const matches = [
      { status: "FINISHED", matchday: 1, kickoffAt: new Date("2025-09-01") },
      { status: "FINISHED", matchday: 2, kickoffAt: new Date("2025-09-08") },
    ];

    expect(resolveCurrentRound(matches, 2)).toBe(2);
  });

  it("ignores a chronologically earlier match with no known matchday", () => {
    const matches = [
      { status: "SCHEDULED", matchday: null, kickoffAt: new Date("2025-09-01") },
      { status: "SCHEDULED", matchday: 2, kickoffAt: new Date("2025-09-08") },
      { status: "FINISHED", matchday: 1, kickoffAt: new Date("2025-08-25") },
    ];

    expect(resolveCurrentRound(matches, 2)).toBe(2);
  });
});
