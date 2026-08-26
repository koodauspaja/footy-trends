import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPETITION_CODE,
  getCompetitionFormat,
  getCompetitionName,
  isCupCompetition,
  parseCompetitionParam,
  SUPPORTED_COMPETITIONS,
} from "@/lib/competitions";

describe("SUPPORTED_COMPETITIONS", () => {
  it("lists 10 competitions with a code, name, flag, country, and format", () => {
    expect(SUPPORTED_COMPETITIONS).toHaveLength(10);
    for (const competition of SUPPORTED_COMPETITIONS) {
      expect(competition.code).toEqual(expect.any(String));
      expect(competition.name).toEqual(expect.any(String));
      expect(competition.flagUrl).toMatch(/^https:\/\//);
      expect(competition.country).toEqual(expect.any(String));
      expect(["league", "cup"]).toContain(competition.format);
    }
  });

  it("keeps the nine original competitions as leagues", () => {
    const leagues = SUPPORTED_COMPETITIONS.filter(
      (competition) => competition.format === "league"
    ).map((competition) => competition.code);

    expect(leagues).toEqual(["PL", "ELC", "FL1", "BL1", "SA", "DED", "PPL", "PD", "BSA"]);
  });

  it("includes Champions League as the only cup", () => {
    const cups = SUPPORTED_COMPETITIONS.filter((competition) => competition.format === "cup");

    expect(cups).toHaveLength(1);
    expect(cups[0]).toMatchObject({ code: "CL", name: "Mestarien liiga", country: "Eurooppa" });
  });

  it("includes Premier League as the default competition", () => {
    expect(DEFAULT_COMPETITION_CODE).toBe("PL");
    expect(SUPPORTED_COMPETITIONS.map((competition) => competition.code)).toContain(
      DEFAULT_COMPETITION_CODE
    );
  });
});

describe("getCompetitionFormat", () => {
  it("reports each competition's own format", () => {
    expect(getCompetitionFormat("PL")).toBe("league");
    expect(getCompetitionFormat("CL")).toBe("cup");
    expect(isCupCompetition("CL")).toBe(true);
    expect(isCupCompetition("PL")).toBe(false);
  });

  it("treats an unknown code as a league, so a bad value cannot reach the cup path", () => {
    expect(getCompetitionFormat("XYZ")).toBe("league");
    expect(isCupCompetition("XYZ")).toBe(false);
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
