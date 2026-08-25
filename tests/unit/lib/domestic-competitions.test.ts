import { describe, expect, it } from "vitest";
import {
  categoryIdForSeason,
  DEFAULT_DOMESTIC_COMPETITION_CODE,
  DOMESTIC_COMPETITIONS,
  earliestSeasonFor,
  getDomesticCompetitionName,
  parseDomesticCompetitionParam,
} from "@/lib/domestic-competitions";

describe("domestic competitions", () => {
  it("defaults to Veikkausliiga", () => {
    expect(DEFAULT_DOMESTIC_COMPETITION_CODE).toBe("VL");
    expect(DOMESTIC_COMPETITIONS.map((c) => c.code)).toContain("VL");
  });

  it("returns a competition's Finnish name", () => {
    expect(getDomesticCompetitionName("VL")).toBe("Veikkausliiga");
  });

  it("falls back to the raw code for an unknown competition", () => {
    expect(getDomesticCompetitionName("XX")).toBe("XX");
  });

  it("parses an absent kilpailu param", () => {
    expect(parseDomesticCompetitionParam(undefined)).toEqual({ kind: "absent" });
  });

  it("parses a valid kilpailu param", () => {
    expect(parseDomesticCompetitionParam("VL")).toEqual({ kind: "valid", code: "VL" });
  });

  it("rejects an unknown or non-string kilpailu param", () => {
    expect(parseDomesticCompetitionParam("XX")).toEqual({ kind: "invalid" });
    expect(parseDomesticCompetitionParam(["VL"])).toEqual({ kind: "invalid" });
  });

  it("keeps every competition's category ranges ordered newest first", () => {
    // `categoryIdForSeason` returns the first range starting at or below the
    // season, which is only the right answer while the list descends.
    for (const competition of DOMESTIC_COMPETITIONS) {
      const seasons = competition.categories.map((category) => category.fromSeason);
      expect(seasons, competition.code).toEqual([...seasons].sort((left, right) => right - left));
    }
  });
});

describe("categoryIdForSeason", () => {
  it("resolves a competition that has always had one category id", () => {
    expect(categoryIdForSeason("VL", 2026)).toBe("VL");
    expect(categoryIdForSeason("VL", 2015)).toBe("VL");
  });

  it("answers with the oldest category for a season below the competition's floor", () => {
    // Unreachable through the UI — the season selector shares that floor —
    // so this only pins down that the helper stays total.
    expect(categoryIdForSeason("VL", 2014)).toBe("VL");
  });

  it("answers with the code itself for an unknown competition", () => {
    expect(categoryIdForSeason("XX", 2026)).toBe("XX");
  });
});

describe("earliestSeasonFor", () => {
  it("returns the oldest season a competition covers", () => {
    expect(earliestSeasonFor("VL")).toBe(2015);
  });

  it("falls back to the provider-wide floor for an unknown competition", () => {
    // A bad `kilpailu` value must not widen the range past what TASO serves.
    expect(earliestSeasonFor("XX")).toBe(2015);
  });
});
