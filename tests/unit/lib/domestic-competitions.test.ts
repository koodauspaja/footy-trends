import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOMESTIC_COMPETITION_CODE,
  DOMESTIC_COMPETITIONS,
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
});
