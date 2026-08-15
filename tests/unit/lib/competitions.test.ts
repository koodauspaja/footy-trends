import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPETITION_CODE,
  getCompetitionName,
  parseCompetitionParam,
  SUPPORTED_COMPETITIONS,
} from "@/lib/competitions";

describe("SUPPORTED_COMPETITIONS", () => {
  it("lists 9 competitions with a code, name, flag, and country", () => {
    expect(SUPPORTED_COMPETITIONS).toHaveLength(9);
    for (const competition of SUPPORTED_COMPETITIONS) {
      expect(competition.code).toEqual(expect.any(String));
      expect(competition.name).toEqual(expect.any(String));
      expect(competition.flagUrl).toMatch(/^https:\/\//);
      expect(competition.country).toEqual(expect.any(String));
    }
  });

  it("includes Premier League as the default competition", () => {
    expect(DEFAULT_COMPETITION_CODE).toBe("PL");
    expect(SUPPORTED_COMPETITIONS.map((competition) => competition.code)).toContain(
      DEFAULT_COMPETITION_CODE
    );
  });
});

describe("parseCompetitionParam", () => {
  it("reports an absent parameter", () => {
    expect(parseCompetitionParam(undefined)).toEqual({ kind: "absent" });
  });

  it("accepts a supported competition code", () => {
    expect(parseCompetitionParam("BL1")).toEqual({ kind: "valid", code: "BL1" });
  });

  it("rejects a code outside the supported list", () => {
    expect(parseCompetitionParam("XYZ")).toEqual({ kind: "invalid" });
  });

  it("rejects a repeated parameter", () => {
    expect(parseCompetitionParam(["PL", "BL1"])).toEqual({ kind: "invalid" });
  });
});

describe("getCompetitionName", () => {
  it("returns the display name for a supported code", () => {
    expect(getCompetitionName("BL1")).toBe("Bundesliga");
  });

  it("falls back to the code itself for an unsupported one", () => {
    expect(getCompetitionName("XYZ")).toBe("XYZ");
  });
});
