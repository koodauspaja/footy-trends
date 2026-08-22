import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listSelectableTasoSeasons,
  parseTasoSeasonParam,
  resolveKotimaaPageContext,
} from "@/lib/kotimaa-page-context";

const resolveTasoSeasonContextMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/taso-standings-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/taso-standings-service")>();
  return { ...actual, resolveTasoSeasonContext: resolveTasoSeasonContextMock };
});

describe("listSelectableTasoSeasons", () => {
  it("lists 2015 up to the given current season, newest first, labeled as bare years", () => {
    const seasons = listSelectableTasoSeasons(2026);

    expect(seasons[0]).toEqual({ seasonId: 2026, label: "2026" });
    expect(seasons.at(-1)).toEqual({ seasonId: 2015, label: "2015" });
    expect(seasons).toHaveLength(12);
  });

  it("extends the range as the discovered season moves, with no code change", () => {
    const seasons = listSelectableTasoSeasons(2027);

    expect(seasons[0]).toEqual({ seasonId: 2027, label: "2027" });
    expect(seasons).toHaveLength(13);
  });
});

describe("parseTasoSeasonParam", () => {
  const seasons = listSelectableTasoSeasons(2026);

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
  beforeEach(() => {
    resolveTasoSeasonContextMock.mockResolvedValue({ currentSeason: 2026, defaultSeason: 2026 });
  });

  it("follows the discovered ceiling, making a newly published season selectable", async () => {
    resolveTasoSeasonContextMock.mockResolvedValue({ currentSeason: 2027, defaultSeason: 2027 });

    const context = await resolveKotimaaPageContext({ kausi: "2027" });

    expect(context.currentSeason).toBe(2027);
    expect(context.season).toEqual({ kind: "valid", seasonId: 2027 });
    expect(context.competitionId).toBe("spljp27");
    expect(context.selectableSeasons[0]).toEqual({ seasonId: 2027, label: "2027" });
  });

  it("lands on the default season, which can lag the ceiling when the new one has no matches", async () => {
    resolveTasoSeasonContextMock.mockResolvedValue({ currentSeason: 2027, defaultSeason: 2026 });

    const context = await resolveKotimaaPageContext({});

    expect(context.seasonId).toBe(2026);
    expect(context.competitionId).toBe("spljp26");
    // Still reachable, just not the landing season.
    expect(context.selectableSeasons[0]).toEqual({ seasonId: 2027, label: "2027" });
  });

  it("defaults to Veikkausliiga and the latest season with no params", async () => {
    const context = await resolveKotimaaPageContext({});

    expect(context.competitionCode).toBe("VL");
    expect(context.competitionName).toBe("Veikkausliiga");
    expect(context.seasonId).toBe(2026);
    expect(context.seasonLabel).toBe("2026");
    expect(context.competitionId).toBe("spljp26");
  });

  it("resolves a valid kausi param to its own competition_id", async () => {
    const context = await resolveKotimaaPageContext({ kausi: "2015" });

    expect(context.seasonId).toBe(2015);
    expect(context.competitionId).toBe("spljp15");
    expect(context.season).toEqual({ kind: "valid", seasonId: 2015 });
  });

  it("falls back to the latest season for an invalid kausi param", async () => {
    const context = await resolveKotimaaPageContext({ kausi: "1999" });

    expect(context.seasonId).toBe(2026);
    expect(context.season).toEqual({ kind: "invalid" });
  });

  it("falls back to VL for an invalid kilpailu param", async () => {
    const context = await resolveKotimaaPageContext({ kilpailu: "XX" });

    expect(context.competitionCode).toBe("VL");
    expect(context.competitionParam).toEqual({ kind: "invalid" });
  });

  it("accepts a valid kilpailu param explicitly", async () => {
    const context = await resolveKotimaaPageContext({ kilpailu: "VL" });

    expect(context.competitionCode).toBe("VL");
    expect(context.competitionParam).toEqual({ kind: "valid", code: "VL" });
  });
});
