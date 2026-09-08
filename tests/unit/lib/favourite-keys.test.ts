import { describe, expect, it } from "vitest";
import {
  competitionKey,
  isFavouriteSource,
  isTeamProviderId,
  MAX_FAVOURITES_PER_KIND,
  parseCompetitionKey,
  parseTeamKey,
  teamKey,
} from "@/lib/favourite-keys";

/**
 * What a favourite is, from specs/026-favourites.md.
 *
 * These keys arrive from a session payload the client cannot vouch for, so the
 * parsing half is about what must be refused rather than what round trips.
 */

describe("teamKey", () => {
  it("keeps the two providers apart, which is the point of the source", () => {
    // 317 exists in both `matches` and `taso_matches` and means different
    // clubs, so the id alone is not an identity.
    expect(teamKey("taso", 317)).not.toBe(teamKey("football-data", 317));
  });

  it("round trips", () => {
    expect(parseTeamKey(teamKey("taso", 60731))).toEqual({ source: "taso", teamProviderId: 60731 });
  });
});

describe("parseTeamKey", () => {
  it.each([
    ["a source the app does not have", "sportradar:1"],
    ["no separator", "taso60731"],
    ["an empty id", "taso:"],
    ["a non-decimal id", "taso:0x10"],
    ["a decimal", "taso:2.5"],
    ["zero", "taso:0"],
    ["negative", "taso:-1"],
    ["past what the column can hold", "taso:2147483648"],
    ["absurdly large", "taso:99999999999999999999"],
    ["nothing at all", ""],
  ])("refuses %s", (_case, key) => {
    // The same rule `parseProviderId` applies in taso.ts: a positive decimal
    // integer, or it is not an id. `Number("0x10")` is 16 and would link to a
    // club nobody asked for.
    expect(parseTeamKey(key)).toBeNull();
  });
});

describe("parseCompetitionKey", () => {
  it("reads the region and the code", () => {
    expect(parseCompetitionKey(competitionKey("kotimaa", "VL"))).toEqual({
      region: "kotimaa",
      code: "VL",
    });
  });

  it("keeps a code containing a colon whole", () => {
    // Splitting on the last colon would lose it; the region is the first field
    // and everything after the first separator is the code.
    expect(parseCompetitionKey("ulkomaat:CL:X")).toEqual({ region: "ulkomaat", code: "CL:X" });
  });

  it.each([
    ["a region the app no longer has", "eurooppa:LL"],
    ["an empty code", "kotimaa:"],
    ["no separator", "kotimaaVL"],
  ])("refuses %s", (_case, key) => {
    expect(parseCompetitionKey(key)).toBeNull();
  });

  it("does not check the code against the registry", () => {
    // Deliberate: a competition retired after someone favourited it still has a
    // row, and `/suosikit` reports it rather than this function hiding it.
    expect(parseCompetitionKey("kotimaa:RETIRED")).toEqual({
      region: "kotimaa",
      code: "RETIRED",
    });
  });
});

describe("isTeamProviderId", () => {
  it("accepts the largest id the column can hold, and refuses the next one", () => {
    // Postgres `integer`. `Number.isSafeInteger` — the bound this replaced —
    // accepts values the column cannot store, which fails at the driver and
    // reaches the reader as "something went wrong" instead of "not an id".
    expect(isTeamProviderId(2_147_483_647)).toBe(true);
    expect(isTeamProviderId(2_147_483_648)).toBe(false);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["fractional", 2.5],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["a string that looks like one", "60731"],
    ["nothing", undefined],
  ])("refuses %s", (_case, value) => {
    expect(isTeamProviderId(value)).toBe(false);
  });
});

describe("the cap", () => {
  it("is one number, so measuring can change it", () => {
    expect(MAX_FAVOURITES_PER_KIND).toBe(50);
  });
});

describe("isFavouriteSource", () => {
  it("accepts the two providers and nothing else", () => {
    expect(isFavouriteSource("taso")).toBe(true);
    expect(isFavouriteSource("football-data")).toBe(true);
    expect(isFavouriteSource("TASO")).toBe(false);
    expect(isFavouriteSource(undefined)).toBe(false);
  });
});
