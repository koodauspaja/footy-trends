import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Paced, ProviderPacers } from "@/lib/providers/pacer";
import { categoryIdForSeason, competitionIdForSeason } from "@/lib/taso/domestic-competitions";

/**
 * The daily refresh with every provider and write mocked: which seasons it asks
 * for, each request paced, and what a failure costs. Its requests go through the
 * providers' 15-minute response cache, which these mocks replace.
 *
 * decisions/080-daily-refresh-of-every-competition.md
 */

const mocks = vi.hoisted(() => ({
  resolveTasoSeasonCeiling: vi.fn(),
  getTasoSeasonMatches: vi.fn(),
  getSeasonGroups: vi.fn(),
  synchronizeTasoMatches: vi.fn(),
  storeSeasonGroups: vi.fn(),
  getSeasonContext: vi.fn(),
  getFootballDataSeasonMatches: vi.fn(),
  synchronizeFootballDataMatches: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  providerPacers: vi.fn(),
}));

// The real rule for the season a page shows, which the step must agree with.
vi.mock("@/lib/taso/taso-seasons", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/taso/taso-seasons")>()),
  resolveTasoSeasonCeiling: mocks.resolveTasoSeasonCeiling,
}));
vi.mock("@/lib/taso/taso", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/taso/taso")>()),
  getSeasonMatches: mocks.getTasoSeasonMatches,
  getSeasonGroups: mocks.getSeasonGroups,
}));
vi.mock("@/lib/taso/taso-sync", () => ({
  synchronizeMatches: mocks.synchronizeTasoMatches,
  storeSeasonGroups: mocks.storeSeasonGroups,
}));
vi.mock("@/lib/football-data/football-data", () => ({
  getSeasonContext: mocks.getSeasonContext,
  getSeasonMatches: mocks.getFootballDataSeasonMatches,
}));
vi.mock("@/lib/football-data/standings-service", () => ({
  synchronizeMatches: mocks.synchronizeFootballDataMatches,
}));
vi.mock("@/lib/platform/logger", () => ({ logger: { info: mocks.info, error: mocks.error } }));
vi.mock("@/lib/providers/pacer", () => ({ providerPacers: mocks.providerPacers }));

import {
  DAILY_FOOTBALL_DATA_CODES,
  DAILY_REFRESH_HOUR_UTC,
  isDailyRefreshHour,
  runDailyRefresh,
} from "@/lib/predictions/daily-refresh";

const DOMESTIC = [
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
  "MSC",
  "NSC",
  "LC",
  "M1LCUP",
];
const FOREIGN = ["PL", "ELC", "FL1", "BL1", "SA", "DED", "PPL", "PD", "BSA", "CL"];
const SEASON = 2024;

type Recorded = { pacers: ProviderPacers; calls: Record<keyof ProviderPacers, number> };

// Pacers that run at once and count what went through them.
function countingPacers(): Recorded {
  const calls = { "football-data": 0, taso: 0 };
  const counting =
    (source: keyof ProviderPacers): Paced =>
    (work) => {
      calls[source]++;
      return work();
    };
  return { pacers: { "football-data": counting("football-data"), taso: counting("taso") }, calls };
}

const GROUPS = [{ id: "groups" }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveTasoSeasonCeiling.mockImplementation(async () => ({
    currentSeason: SEASON,
    newestStored: SEASON,
    discoveryFailed: false,
  }));
  mocks.getTasoSeasonMatches.mockImplementation(
    async (_competitionId: string, categoryId: string) => [{ categoryId }]
  );
  mocks.getSeasonGroups.mockResolvedValue(GROUPS);
  mocks.synchronizeTasoMatches.mockResolvedValue(undefined);
  mocks.storeSeasonGroups.mockResolvedValue(undefined);
  mocks.getSeasonContext.mockImplementation(async () => ({ activeSeasonId: SEASON }));
  mocks.getFootballDataSeasonMatches.mockImplementation(async (code: string, seasonId: number) => [
    { code, seasonId },
  ]);
  mocks.synchronizeFootballDataMatches.mockResolvedValue(undefined);
});

describe("isDailyRefreshHour", () => {
  it("is the run that starts in the 03 hour, UTC, and no other", () => {
    expect(DAILY_REFRESH_HOUR_UTC).toBe(3);
    expect(isDailyRefreshHour(new Date("2024-06-01T03:00:00Z"))).toBe(true);
    expect(isDailyRefreshHour(new Date("2024-06-01T03:59:59Z"))).toBe(true);
    expect(isDailyRefreshHour(new Date("2024-06-01T02:59:59Z"))).toBe(false);
    expect(isDailyRefreshHour(new Date("2024-06-01T04:00:00Z"))).toBe(false);
    // 03:00 in Helsinki is not 03:00 UTC.
    expect(isDailyRefreshHour(new Date("2024-01-15T03:00:00+02:00"))).toBe(false);
  });
});

describe("runDailyRefresh", () => {
  it("refreshes every domestic competition's matches and groups, and every foreign one's matches", async () => {
    const { pacers } = countingPacers();

    const report = await runDailyRefresh(pacers);

    expect(report).toEqual({ refreshed: 24, failures: [] });
    expect(mocks.resolveTasoSeasonCeiling.mock.calls.map(([code]) => code).sort()).toEqual(
      [...DOMESTIC].sort()
    );
    for (const code of DOMESTIC) {
      const competitionId = competitionIdForSeason(code, SEASON);
      const categoryId = categoryIdForSeason(code, SEASON);
      expect(mocks.getTasoSeasonMatches).toHaveBeenCalledWith(competitionId, categoryId, SEASON);
      expect(mocks.synchronizeTasoMatches).toHaveBeenCalledWith([{ categoryId }]);
      expect(mocks.getSeasonGroups).toHaveBeenCalledWith(competitionId, categoryId);
      expect(mocks.storeSeasonGroups).toHaveBeenCalledWith(
        GROUPS,
        categoryId,
        competitionId,
        SEASON
      );
    }
    expect(mocks.getSeasonContext.mock.calls.map(([code]) => code).sort()).toEqual(
      [...FOREIGN].sort()
    );
    for (const code of FOREIGN) {
      expect(mocks.synchronizeFootballDataMatches).toHaveBeenCalledWith([
        { code, seasonId: SEASON },
      ]);
    }
    expect(mocks.info).toHaveBeenCalledWith(report, "Daily refresh finished");
  });

  it("leaves out the national teams' competitions, TASO's and football-data's", async () => {
    await runDailyRefresh(countingPacers().pacers);

    expect(DAILY_FOOTBALL_DATA_CODES).toEqual(FOREIGN);
    const asked = [
      ...mocks.resolveTasoSeasonCeiling.mock.calls,
      ...mocks.getSeasonContext.mock.calls,
    ].map(([code]) => code as string);
    expect(asked).not.toContain("WC");
    expect(asked).not.toContain("EC");
    expect(asked.some((code) => code.startsWith("maajp"))).toBe(false);
  });

  it("paces every request: discovery, matches and groups for TASO, context and matches for football-data", async () => {
    const { pacers, calls } = countingPacers();

    await runDailyRefresh(pacers);

    expect(calls.taso).toBe(DOMESTIC.length * 3);
    expect(calls["football-data"]).toBe(FOREIGN.length * 2);
  });

  it("makes each provider request inside its own pacer's turn, not beside it", async () => {
    const open = { "football-data": 0, taso: 0 };
    const unpaced: string[] = [];
    const turn =
      (source: keyof ProviderPacers): Paced =>
      async (work) => {
        open[source]++;
        try {
          return await work();
        } finally {
          open[source]--;
        }
      };
    const checked =
      (source: keyof ProviderPacers, name: string, answer: (...args: never[]) => unknown) =>
      async (...args: never[]) => {
        if (open[source] === 0) unpaced.push(name);
        return answer(...args);
      };
    mocks.resolveTasoSeasonCeiling.mockImplementation(
      checked("taso", "ceiling", () => ({
        currentSeason: SEASON,
        newestStored: SEASON,
        discoveryFailed: false,
      }))
    );
    mocks.getTasoSeasonMatches.mockImplementation(checked("taso", "taso matches", () => [{}]));
    mocks.getSeasonGroups.mockImplementation(checked("taso", "groups", () => GROUPS));
    mocks.getSeasonContext.mockImplementation(
      checked("football-data", "context", () => ({ activeSeasonId: SEASON }))
    );
    mocks.getFootballDataSeasonMatches.mockImplementation(
      checked("football-data", "football-data matches", () => [{}])
    );

    await runDailyRefresh({ "football-data": turn("football-data"), taso: turn("taso") });

    expect(unpaced).toEqual([]);
    expect(mocks.getSeasonGroups).toHaveBeenCalledTimes(DOMESTIC.length);
  });

  it("uses the providers' own pacers when given none", async () => {
    const { pacers, calls } = countingPacers();
    mocks.providerPacers.mockReturnValue(pacers);

    await runDailyRefresh();

    expect(mocks.providerPacers).toHaveBeenCalledTimes(1);
    expect(calls.taso).toBeGreaterThan(0);
    expect(calls["football-data"]).toBeGreaterThan(0);
  });

  it("also refreshes a football-data season that is listed but has not started", async () => {
    mocks.getSeasonContext.mockImplementation(async (code: string) =>
      code === "PL"
        ? { activeSeasonId: SEASON, upcomingSeasonId: SEASON + 1 }
        : { activeSeasonId: SEASON }
    );

    const report = await runDailyRefresh(countingPacers().pacers);

    expect(report.refreshed).toBe(25);
    expect(mocks.getFootballDataSeasonMatches).toHaveBeenCalledWith("PL", SEASON);
    expect(mocks.getFootballDataSeasonMatches).toHaveBeenCalledWith("PL", SEASON + 1);
    expect(mocks.getFootballDataSeasonMatches).not.toHaveBeenCalledWith("ELC", SEASON + 1);
  });

  it("names a TASO competition that fails, stores nothing more for it, and still refreshes the rest", async () => {
    const vlCategoryId = categoryIdForSeason("VL", SEASON);
    const refused = new Error("TASO 403");
    // Most domestic competitions share one TASO competition id; the category tells them apart.
    mocks.getTasoSeasonMatches.mockImplementation(
      async (_competitionId: string, categoryId: string) => {
        if (categoryId === vlCategoryId) throw refused;
        return [{ categoryId }];
      }
    );

    const report = await runDailyRefresh(countingPacers().pacers);

    expect(report).toEqual({ refreshed: 23, failures: [`daily taso VL ${SEASON}`] });
    expect(mocks.getSeasonGroups).not.toHaveBeenCalledWith(
      competitionIdForSeason("VL", SEASON),
      vlCategoryId
    );
    expect(mocks.error).toHaveBeenCalledWith(
      { err: refused, source: "taso", code: "VL", seasonId: SEASON },
      "Daily refresh of a competition failed"
    );
  });

  it("names a failed group write as the competition's failure", async () => {
    mocks.storeSeasonGroups.mockImplementation(async (_groups, categoryId: string) => {
      if (categoryId === categoryIdForSeason("LC", SEASON)) throw new Error("deadlock");
    });

    const report = await runDailyRefresh(countingPacers().pacers);

    expect(report).toEqual({ refreshed: 23, failures: [`daily taso LC ${SEASON}`] });
  });

  it("refreshes the season a failed discovery fell back to, and names the discovery", async () => {
    mocks.resolveTasoSeasonCeiling.mockImplementation(async (code: string) => ({
      currentSeason: SEASON,
      newestStored: SEASON,
      discoveryFailed: code === "M1",
    }));

    const report = await runDailyRefresh(countingPacers().pacers);

    expect(report).toEqual({ refreshed: 24, failures: ["daily taso M1 season"] });
    expect(mocks.getTasoSeasonMatches).toHaveBeenCalledWith(
      competitionIdForSeason("M1", SEASON),
      categoryIdForSeason("M1", SEASON),
      SEASON
    );
  });

  it("names a competition whose season cannot be resolved, and fetches nothing for it", async () => {
    mocks.resolveTasoSeasonCeiling.mockImplementation(async (code: string) => {
      if (code === "NSC") throw new Error("database unreachable");
      return { currentSeason: SEASON, newestStored: SEASON, discoveryFailed: false };
    });

    const report = await runDailyRefresh(countingPacers().pacers);

    expect(report).toEqual({ refreshed: 23, failures: ["daily taso NSC season"] });
    expect(mocks.getTasoSeasonMatches).toHaveBeenCalledTimes(DOMESTIC.length - 1);
  });

  it("does not count a season with no matches yet as a failure", async () => {
    mocks.getTasoSeasonMatches.mockResolvedValue([]);
    mocks.getSeasonGroups.mockResolvedValue([]);

    const report = await runDailyRefresh(countingPacers().pacers);

    // Each ceiling is also the season its page shows, so nothing else is fetched.
    expect(report).toEqual({ refreshed: 24, failures: [] });
    expect(mocks.getTasoSeasonMatches).toHaveBeenCalledTimes(DOMESTIC.length);
    // Group rows alone would make a page land on a season with no matches.
    expect(mocks.getSeasonGroups).not.toHaveBeenCalled();
    expect(mocks.storeSeasonGroups).not.toHaveBeenCalled();
    expect(mocks.synchronizeTasoMatches).not.toHaveBeenCalled();
  });

  it("refreshes the shown season when the newest one fails", async () => {
    mocks.resolveTasoSeasonCeiling.mockImplementation(async (code: string) => ({
      currentSeason: code === "M2" ? SEASON + 1 : SEASON,
      newestStored: SEASON,
      discoveryFailed: false,
    }));
    mocks.getTasoSeasonMatches.mockImplementation(
      async (_competitionId: string, categoryId: string, seasonId: number) => {
        if (categoryId === categoryIdForSeason("M2", seasonId) && seasonId === SEASON + 1) {
          throw new Error("TASO 500");
        }
        return [{ categoryId, seasonId }];
      }
    );

    const report = await runDailyRefresh(countingPacers().pacers);

    expect(report).toEqual({ refreshed: 24, failures: [`daily taso M2 ${SEASON + 1}`] });
    expect(mocks.synchronizeTasoMatches).toHaveBeenCalledWith([
      { categoryId: categoryIdForSeason("M2", SEASON), seasonId: SEASON },
    ]);
  });

  it("also refreshes the season a page shows while the newest one TASO lists has no matches", async () => {
    mocks.resolveTasoSeasonCeiling.mockImplementation(async () => ({
      currentSeason: SEASON + 1,
      newestStored: SEASON,
      discoveryFailed: false,
    }));
    const vlNext = categoryIdForSeason("VL", SEASON + 1);
    mocks.getTasoSeasonMatches.mockImplementation(
      async (_competitionId: string, categoryId: string, seasonId: number) =>
        seasonId === SEASON + 1 && categoryId !== vlNext ? [] : [{ categoryId, seasonId }]
    );

    const { pacers, calls } = countingPacers();
    const report = await runDailyRefresh(pacers);

    // VL's next season has matches, so its page shows that one alone; the other
    // thirteen show the season before, and both are fetched.
    expect(report).toEqual({ refreshed: 24 + 13, failures: [] });
    // Discovery and the empty season's matches, then the shown season's matches
    // and groups: four each, and VL's three.
    expect(calls.taso).toBe(13 * 4 + 3);
    expect(mocks.getTasoSeasonMatches).not.toHaveBeenCalledWith(
      competitionIdForSeason("VL", SEASON),
      categoryIdForSeason("VL", SEASON),
      SEASON
    );
    expect(mocks.getTasoSeasonMatches).toHaveBeenCalledWith(
      competitionIdForSeason("M1", SEASON),
      categoryIdForSeason("M1", SEASON),
      SEASON
    );
    expect(mocks.storeSeasonGroups).toHaveBeenCalledWith(
      GROUPS,
      categoryIdForSeason("M1", SEASON),
      competitionIdForSeason("M1", SEASON),
      SEASON
    );
    expect(mocks.getSeasonGroups).not.toHaveBeenCalledWith(
      competitionIdForSeason("M1", SEASON + 1),
      categoryIdForSeason("M1", SEASON + 1)
    );
  });

  it("names the shown season when it fails, apart from the newest one", async () => {
    mocks.resolveTasoSeasonCeiling.mockImplementation(async (code: string) => ({
      currentSeason: code === "NL" ? SEASON + 1 : SEASON,
      newestStored: SEASON,
      discoveryFailed: false,
    }));
    mocks.getTasoSeasonMatches.mockImplementation(
      async (_competitionId: string, categoryId: string, seasonId: number) => {
        if (categoryId !== categoryIdForSeason("NL", seasonId)) return [{ categoryId }];
        if (seasonId === SEASON) throw new Error("TASO 500");
        return [];
      }
    );

    const report = await runDailyRefresh(countingPacers().pacers);

    expect(report).toEqual({ refreshed: 24, failures: [`daily taso NL ${SEASON}`] });
  });

  it("fetches nothing when discovery failed and nothing is stored, rather than a past season", async () => {
    mocks.resolveTasoSeasonCeiling.mockImplementation(async (code: string) => ({
      currentSeason: code === "N1" ? 2016 : SEASON,
      newestStored: code === "N1" ? null : SEASON,
      discoveryFailed: code === "N1",
    }));

    const report = await runDailyRefresh(countingPacers().pacers);

    expect(report).toEqual({ refreshed: 23, failures: ["daily taso N1 season"] });
    expect(mocks.getTasoSeasonMatches.mock.calls.some(([, , seasonId]) => seasonId === 2016)).toBe(
      false
    );
  });

  it("names a football-data competition whose seasons cannot be read", async () => {
    mocks.getSeasonContext.mockImplementation(async (code: string) => {
      if (code === "SA") throw new Error("football-data 429");
      return { activeSeasonId: SEASON };
    });

    const report = await runDailyRefresh(countingPacers().pacers);

    expect(report).toEqual({ refreshed: 23, failures: ["daily football-data SA season"] });
    expect(mocks.getFootballDataSeasonMatches).not.toHaveBeenCalledWith("SA", SEASON);
  });

  it("keeps the active season when only the upcoming one fails", async () => {
    mocks.getSeasonContext.mockImplementation(async (code: string) =>
      code === "BSA"
        ? { activeSeasonId: SEASON, upcomingSeasonId: SEASON + 1 }
        : { activeSeasonId: SEASON }
    );
    mocks.getFootballDataSeasonMatches.mockImplementation(
      async (code: string, seasonId: number) => {
        if (seasonId === SEASON + 1) throw new Error("football-data 500");
        return [{ code, seasonId }];
      }
    );

    const report = await runDailyRefresh(countingPacers().pacers);

    expect(report).toEqual({
      refreshed: 24,
      failures: [`daily football-data BSA ${SEASON + 1}`],
    });
    expect(mocks.synchronizeFootballDataMatches).toHaveBeenCalledWith([
      { code: "BSA", seasonId: SEASON },
    ]);
  });
});
