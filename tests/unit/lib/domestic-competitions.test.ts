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

  it("lists the ten competitions, flat and in tier order", () => {
    expect(DOMESTIC_COMPETITIONS.map((competition) => competition.code)).toEqual([
      "VL",
      "M1L",
      "M1",
      "M2",
      "NL",
      "N1",
      "P21SM",
      "P211",
      "P18SM",
      "T18SM",
    ]);
  });

  it("names each competition as TASO currently does", () => {
    expect(DOMESTIC_COMPETITIONS.map((competition) => competition.name)).toEqual([
      "Veikkausliiga",
      "Ykkösliiga",
      "Ykkönen",
      "Miesten Kakkonen",
      "Briotech Kansallinen Liiga",
      "Kansallinen Ykkönen",
      "P21 SM",
      "P21 Ykkönen",
      "P18 SM",
      "T18 SM",
    ]);
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

  it("follows a junior competition back through its predecessor ids", () => {
    // Each era is a different category_id in TASO, confirmed against
    // getCategories for every season.
    expect(categoryIdForSeason("P21SM", 2026)).toBe("P21SM");
    expect(categoryIdForSeason("P21SM", 2025)).toBe("P20SM");
    expect(categoryIdForSeason("P21SM", 2017)).toBe("P20SM");
    expect(categoryIdForSeason("P21SM", 2016)).toBe("ASM");
    expect(categoryIdForSeason("P21SM", 2015)).toBe("ASM");
  });

  it("resolves every junior competition at both of its boundaries", () => {
    const boundaries: [string, number, string][] = [
      ["P211", 2026, "P211"],
      ["P211", 2025, "P201"],
      ["P211", 2017, "P201"],
      ["P211", 2016, "APY"],
      ["P18SM", 2026, "P18SM"],
      ["P18SM", 2025, "P17SM"],
      ["P18SM", 2017, "P17SM"],
      ["P18SM", 2016, "BSM"],
      // T18 SM kept its id from 2017 on, so it has one boundary, not two.
      ["T18SM", 2017, "T18SM"],
      ["T18SM", 2016, "BTSM"],
    ];

    for (const [code, season, expected] of boundaries) {
      expect(categoryIdForSeason(code, season), `${code} ${season}`).toBe(expected);
    }
  });

  it("resolves Ykkösliiga only from the season it was created", () => {
    expect(categoryIdForSeason("M1L", 2024)).toBe("M1L");
    // Below its floor, which the season selector never offers.
    expect(categoryIdForSeason("M1L", 2023)).toBe("M1L");
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

  it("floors Ykkösliiga at 2024, since it did not exist before", () => {
    expect(earliestSeasonFor("M1L")).toBe(2024);
  });

  it("floors a junior competition at its oldest predecessor, not its own id", () => {
    expect(earliestSeasonFor("P21SM")).toBe(2015);
    expect(earliestSeasonFor("T18SM")).toBe(2015);
  });

  it("falls back to the provider-wide floor for an unknown competition", () => {
    // A bad `kilpailu` value must not widen the range past what TASO serves.
    expect(earliestSeasonFor("XX")).toBe(2015);
  });
});
