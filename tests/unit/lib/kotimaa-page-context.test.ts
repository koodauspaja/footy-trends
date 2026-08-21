import { describe, expect, it } from "vitest";
import {
  listSelectableTasoSeasons,
  parseTasoSeasonParam,
  resolveKotimaaPageContext,
} from "@/lib/kotimaa-page-context";

describe("listSelectableTasoSeasons", () => {
  it("lists 2015 through 2026, newest first, labeled as bare years", () => {
    const seasons = listSelectableTasoSeasons();

    expect(seasons[0]).toEqual({ seasonId: 2026, label: "2026" });
    expect(seasons.at(-1)).toEqual({ seasonId: 2015, label: "2015" });
    expect(seasons).toHaveLength(12);
  });
});

describe("parseTasoSeasonParam", () => {
  const seasons = listSelectableTasoSeasons();

  it("treats an absent value as absent", () => {
    expect(parseTasoSeasonParam(undefined, seasons)).toEqual({ kind: "absent" });
  });

  it("accepts a season within the selectable range", () => {
    expect(parseTasoSeasonParam("2020", seasons)).toEqual({ kind: "valid", seasonId: 2020 });
  });

  it("rejects a season outside the range, a non-numeric value, and an array value", () => {
    expect(parseTasoSeasonParam("2014", seasons)).toEqual({ kind: "invalid" });
    expect(parseTasoSeasonParam("not-a-year", seasons)).toEqual({ kind: "invalid" });
    expect(parseTasoSeasonParam(["2020"], seasons)).toEqual({ kind: "invalid" });
  });
});

describe("resolveKotimaaPageContext", () => {
  it("defaults to Veikkausliiga and the latest season with no params", () => {
    const context = resolveKotimaaPageContext({});

    expect(context.competitionCode).toBe("VL");
    expect(context.competitionName).toBe("Veikkausliiga");
    expect(context.seasonId).toBe(2026);
    expect(context.seasonLabel).toBe("2026");
    expect(context.competitionId).toBe("spljp26");
  });

  it("resolves a valid kausi param to its own competition_id", () => {
    const context = resolveKotimaaPageContext({ kausi: "2015" });

    expect(context.seasonId).toBe(2015);
    expect(context.competitionId).toBe("spljp15");
    expect(context.season).toEqual({ kind: "valid", seasonId: 2015 });
  });

  it("falls back to the latest season for an invalid kausi param", () => {
    const context = resolveKotimaaPageContext({ kausi: "1999" });

    expect(context.seasonId).toBe(2026);
    expect(context.season).toEqual({ kind: "invalid" });
  });

  it("falls back to VL for an invalid kilpailu param", () => {
    const context = resolveKotimaaPageContext({ kilpailu: "XX" });

    expect(context.competitionCode).toBe("VL");
    expect(context.competitionParam).toEqual({ kind: "invalid" });
  });

  it("accepts a valid kilpailu param explicitly", () => {
    const context = resolveKotimaaPageContext({ kilpailu: "VL" });

    expect(context.competitionCode).toBe("VL");
    expect(context.competitionParam).toEqual({ kind: "valid", code: "VL" });
  });
});
