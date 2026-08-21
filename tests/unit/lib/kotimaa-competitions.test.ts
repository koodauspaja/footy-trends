import { describe, expect, it } from "vitest";
import {
  DEFAULT_KOTIMAA_COMPETITION_CODE,
  getKotimaaCompetitionName,
  KOTIMAA_COMPETITIONS,
  parseKotimaaCompetitionParam,
} from "@/lib/kotimaa-competitions";

describe("kotimaa competitions", () => {
  it("defaults to Veikkausliiga", () => {
    expect(DEFAULT_KOTIMAA_COMPETITION_CODE).toBe("VL");
    expect(KOTIMAA_COMPETITIONS.map((c) => c.code)).toContain("VL");
  });

  it("returns a competition's Finnish name", () => {
    expect(getKotimaaCompetitionName("VL")).toBe("Veikkausliiga");
  });

  it("falls back to the raw code for an unknown competition", () => {
    expect(getKotimaaCompetitionName("XX")).toBe("XX");
  });

  it("parses an absent kilpailu param", () => {
    expect(parseKotimaaCompetitionParam(undefined)).toEqual({ kind: "absent" });
  });

  it("parses a valid kilpailu param", () => {
    expect(parseKotimaaCompetitionParam("VL")).toEqual({ kind: "valid", code: "VL" });
  });

  it("rejects an unknown or non-string kilpailu param", () => {
    expect(parseKotimaaCompetitionParam("XX")).toEqual({ kind: "invalid" });
    expect(parseKotimaaCompetitionParam(["VL"])).toEqual({ kind: "invalid" });
  });
});
