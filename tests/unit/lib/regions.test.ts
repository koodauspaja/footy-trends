import { describe, expect, it } from "vitest";
import { isRegionSegment, resolveRegion, toPreferences } from "@/lib/regions";

describe("isRegionSegment", () => {
  it.each(["kotimaa", "ulkomaat", "maajoukkueet"])("accepts %s", (value) => {
    expect(isRegionSegment(value)).toBe(true);
  });

  it.each([
    ["a region that does not exist", "eurooppa"],
    ["an English folder name", "domestic"],
    ["a prototype key", "__proto__"],
    ["null", null],
    ["undefined", undefined],
    ["a number", 1],
    ["an object", {}],
  ])("rejects %s", (_case, value) => {
    expect(isRegionSegment(value)).toBe(false);
  });
});

describe("resolveRegion", () => {
  it("passes through a stored region", () => {
    expect(resolveRegion("kotimaa")).toBe("kotimaa");
  });

  it.each([
    ["a retired region", "eurooppa"],
    ["nothing stored", null],
  ])("gives null for %s", (_case, stored) => {
    // The column is plain text. A value that no longer means anything must
    // leave the reader on the picker, not redirect them somewhere absent.
    expect(resolveRegion(stored)).toBeNull();
  });
});

describe("toPreferences", () => {
  it("carries the competition columns through untouched", () => {
    // Competition codes are validated against their registry at the point of
    // use, not here — this only has to know about regions.
    expect(
      toPreferences({
        defaultRegion: "ulkomaat",
        defaultCompetitionDomestic: "M1L",
        defaultCompetitionForeign: null,
        defaultCompetitionNational: "GONE",
      })
    ).toEqual({
      defaultRegion: "ulkomaat",
      defaultCompetitionDomestic: "M1L",
      defaultCompetitionForeign: null,
      defaultCompetitionNational: "GONE",
    });
  });

  it("drops a region it cannot recognise", () => {
    expect(
      toPreferences({
        defaultRegion: "eurooppa",
        defaultCompetitionDomestic: null,
        defaultCompetitionForeign: null,
        defaultCompetitionNational: null,
      }).defaultRegion
    ).toBeNull();
  });
});
