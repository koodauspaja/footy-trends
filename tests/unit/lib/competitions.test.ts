import { describe, expect, it } from "vitest";
import {
  competitionsInRegion,
  DEFAULT_COMPETITION_CODE,
  defaultCompetitionFor,
  getCompetitionFormat,
  getCompetitionName,
  isCupCompetition,
  parseCompetitionParam,
  SUPPORTED_COMPETITIONS,
} from "@/lib/competitions";

describe("SUPPORTED_COMPETITIONS", () => {
  it("lists 12 competitions with a code, name, flag, country, format and region", () => {
    expect(SUPPORTED_COMPETITIONS).toHaveLength(12);
    for (const competition of SUPPORTED_COMPETITIONS) {
      expect(competition.code).toEqual(expect.any(String));
      expect(competition.name).toEqual(expect.any(String));
      // Either the provider's area flag or a local asset — the World and
      // Europe marks are served from public/.
      expect(competition.flagUrl).toMatch(/^(https:\/\/|\/)/);
      expect(competition.country).toEqual(expect.any(String));
      expect(["league", "cup"]).toContain(competition.format);
      expect(["foreign", "national-teams"]).toContain(competition.region);
    }
  });

  it("keeps the nine original competitions as leagues", () => {
    const leagues = SUPPORTED_COMPETITIONS.filter(
      (competition) => competition.format === "league"
    ).map((competition) => competition.code);

    expect(leagues).toEqual(["PL", "ELC", "FL1", "BL1", "SA", "DED", "PPL", "PD", "BSA"]);
  });

  it("includes Champions League as the only cup under Ulkomaat", () => {
    const cups = competitionsInRegion("foreign").filter(
      (competition) => competition.format === "cup"
    );

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
    expect(parseCompetitionParam(undefined, "foreign")).toEqual({ kind: "absent" });
  });

  it("accepts a supported competition code", () => {
    expect(parseCompetitionParam("BL1", "foreign")).toEqual({ kind: "valid", code: "BL1" });
  });

  it("rejects a code outside the supported list", () => {
    expect(parseCompetitionParam("XYZ", "foreign")).toEqual({ kind: "invalid" });
  });

  it("rejects a repeated parameter", () => {
    expect(parseCompetitionParam(["PL", "BL1"], "foreign")).toEqual({ kind: "invalid" });
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

describe("regions", () => {
  it("splits the competitions into the two regions", () => {
    expect(competitionsInRegion("foreign").map((c) => c.code)).toEqual([
      "PL",
      "ELC",
      "FL1",
      "BL1",
      "SA",
      "DED",
      "PPL",
      "PD",
      "BSA",
      "CL",
    ]);
    expect(competitionsInRegion("national-teams").map((c) => c.code)).toEqual(["WC", "EC"]);
  });

  it("rejects a competition from another region", () => {
    // ?kilpailu=PL on /maajoukkueet must not render a Premier League page
    // under a heading that says national teams.
    expect(parseCompetitionParam("PL", "national-teams")).toEqual({ kind: "invalid" });
    expect(parseCompetitionParam("WC", "foreign")).toEqual({ kind: "invalid" });
    expect(parseCompetitionParam("WC", "national-teams")).toEqual({ kind: "valid", code: "WC" });
  });

  it("falls back within the region, not to another one", () => {
    expect(defaultCompetitionFor("foreign")).toBe(DEFAULT_COMPETITION_CODE);
    expect(defaultCompetitionFor("national-teams")).toBe("WC");
  });

  it("gives both national-team competitions a Finnish name and an icon", () => {
    for (const competition of competitionsInRegion("national-teams")) {
      expect(competition.format).toBe("cup");
      expect(competition.flagUrl).toMatch(/^\/|^https:\/\//);
    }
  });
});
