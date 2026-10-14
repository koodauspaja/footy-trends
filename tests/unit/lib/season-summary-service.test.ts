import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SeasonReadResult } from "@/lib/season-comparison";
import type { StreakRecordsSeries } from "@/lib/streak-records";

/**
 * The block's read path: the upset read for the provider and season asked
 * about, and one `error` line when anything under it throws.
 *
 * decisions/066-season-summary.md
 */

const mocks = vi.hoisted(() => ({ getTeamUpset: vi.fn(), loggerError: vi.fn() }));

vi.mock("@/lib/surprise-service", () => ({ getTeamUpset: mocks.getTeamUpset }));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.loggerError } }));

import { getSeasonSummary } from "@/lib/season-summary-service";

// Five home wins in 2026, the only stored season: a block with the upset alone.
const SEASON: SeasonReadResult = {
  status: "ok",
  read: {
    competition: "Veikkausliiga",
    finished: [1, 2, 3, 4, 5].map((day) => ({
      providerMatchId: day,
      kickoffAt: new Date(Date.UTC(2026, 4, day)),
      homeTeamProviderId: 1,
      awayTeamProviderId: 2,
      homeGoals: 1,
      awayGoals: 0,
      matchday: day,
    })),
    all: [],
    points: [],
    teamCount: 0,
  },
};

function readers(read: () => Promise<SeasonReadResult> = async () => SEASON) {
  return {
    teamId: 1,
    selected: { competitionCode: "VL", seasonId: 2026 },
    activeSeasonId: 2026,
    seasons: [{ competitionCode: "VL", seasonId: 2026 }],
    isLeague: () => true,
    label: String,
    read,
    records: async (): Promise<StreakRecordsSeries> => ({ status: "unavailable" }),
  };
}

beforeEach(() => {
  mocks.getTeamUpset.mockReset();
  mocks.loggerError.mockReset();
});

describe("getSeasonSummary", () => {
  it("reads the upset for the provider, competition, season and team asked about", async () => {
    const upset = {
      providerMatchId: 3,
      kickoffAt: new Date("2026-05-03T15:00:00Z"),
      homeTeamProviderId: 1,
      homeTeamName: "AC Oulu",
      awayTeamProviderId: 2,
      awayTeamName: "KuPS",
      homeGoals: 1,
      awayGoals: 0,
      home: 0.16,
      draw: 0.24,
      away: 0.6,
      probability: 0.16,
    };
    mocks.getTeamUpset.mockResolvedValueOnce(upset);

    await expect(getSeasonSummary("taso", readers())).resolves.toEqual({
      status: "ok",
      facts: [{ kind: "upset", match: upset }],
      inProgress: true,
      seasonLabel: "2026",
    });
    expect(mocks.getTeamUpset).toHaveBeenCalledWith("taso", "VL", 2026, 1);
  });

  it("turns anything thrown into the failure, and logs one line saying what it summarised", async () => {
    mocks.getTeamUpset.mockRejectedValueOnce(new Error("connection reset"));

    await expect(getSeasonSummary("football-data", readers())).resolves.toEqual({
      status: "error",
    });
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      {
        source: "football-data",
        teamProviderId: 1,
        competitionCode: "VL",
        seasonId: 2026,
        err: expect.any(Error),
      },
      "Unable to summarise the season"
    );
  });

  it("logs nothing for a read that reports its own failure", async () => {
    await expect(
      getSeasonSummary(
        "taso",
        readers(async () => ({ status: "error" }))
      )
    ).resolves.toEqual({ status: "error" });
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});
