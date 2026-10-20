import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SeasonReadResult } from "@/lib/season-comparison";
import type { StreakRecordsSeries } from "@/lib/streak-records";

/**
 * The block's read path: the upset read for the provider and season asked
 * about, the records read as `Ennätykset` reads them, and one `error` line when
 * anything under it fails.
 *
 * decisions/066-season-summary.md
 */

const mocks = vi.hoisted(() => ({ getTeamUpset: vi.fn(), loggerError: vi.fn() }));

vi.mock("@/lib/surprise-service", () => ({ getTeamUpset: mocks.getTeamUpset }));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.loggerError } }));

import { getSeasonSummary, teamSeasonSummary } from "@/lib/season-summary-service";

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
    expect(mocks.loggerError).not.toHaveBeenCalled();
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
    expect(mocks.getTeamUpset).toHaveBeenCalledWith("football-data", "VL", 2026, 1);
  });

  it("logs one line for a read that reports its own failure, with no error to carry", async () => {
    await expect(
      getSeasonSummary(
        "taso",
        readers(async () => ({ status: "error" }))
      )
    ).resolves.toEqual({ status: "error" });
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { source: "taso", teamProviderId: 1, competitionCode: "VL", seasonId: 2026 },
      "Unable to summarise the season"
    );
  });

  it("logs nothing for a failed season lookup, which logged itself", async () => {
    await expect(getSeasonSummary("taso", { ...readers(), seasons: null })).resolves.toEqual({
      status: "error",
    });
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it("logs a records read that threw once, with its error", async () => {
    mocks.getTeamUpset.mockResolvedValueOnce(null);
    const throwing = {
      ...readers(),
      // Three earlier seasons, so the records are read at all.
      seasons: [2023, 2024, 2025, 2026].map((seasonId) => ({ competitionCode: "VL", seasonId })),
      records: async (): Promise<StreakRecordsSeries> => {
        throw new Error("records failed");
      },
    };

    await expect(getSeasonSummary("taso", throwing)).resolves.toEqual({ status: "error" });
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.objectContaining({ message: "records failed" }) }),
      "Unable to summarise the season"
    );
  });

  it("logs nothing when there is simply no block", async () => {
    mocks.getTeamUpset.mockResolvedValueOnce(null);

    await expect(getSeasonSummary("taso", readers())).resolves.toEqual({
      status: "unavailable",
    });
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});

// A season of `TEAM` 1's home matches, each won when `won` says so.
function homeSeason(seasonId: number, won: readonly boolean[]): SeasonReadResult {
  return {
    status: "ok",
    read: {
      competition: "Veikkausliiga",
      all: [],
      points: [],
      teamCount: 0,
      finished: won.map((win, index) => ({
        providerMatchId: seasonId * 100 + index,
        kickoffAt: new Date(Date.UTC(seasonId, 4, index + 1)),
        homeTeamProviderId: 1,
        awayTeamProviderId: 2,
        homeGoals: win ? 1 : 0,
        awayGoals: win ? 0 : 1,
        matchday: index + 1,
      })),
    },
  };
}

describe("teamSeasonSummary", () => {
  it("reads the records over the provider's league seasons, its reader and the page's labels", async () => {
    mocks.getTeamUpset.mockResolvedValue(null);
    const lost = [false, false, false, false, false];
    // Three lost seasons, then five wins; the cup's seven are not a league's.
    const stored: Record<string, SeasonReadResult> = {
      "VL-2023": homeSeason(2023, lost),
      "VL-2024": homeSeason(2024, lost),
      "VL-2025": homeSeason(2025, lost),
      "VL-2026": homeSeason(2026, [true, true, true, true, true]),
      "SC-2026": homeSeason(2026, [true, true, true, true, true, true, true]),
    };
    const read = vi.fn(
      async (
        key: { competitionCode: string; seasonId: number },
        _activeSeasonId: number,
        _teamProviderId: number
      ) => stored[`${key.competitionCode}-${key.seasonId}`] ?? { status: "empty" as const }
    );
    const summary = teamSeasonSummary("taso", { isLeague: (code) => code === "VL", read });
    const seasons = [2023, 2024, 2025, 2026]
      .map((seasonId) => ({ competitionCode: "VL", seasonId, matches: 5 }))
      .concat({ competitionCode: "SC", seasonId: 2026, matches: 7 });

    const result = await summary("VL", 1, 2026, 2026, seasons, (year) => `Kausi ${year}`);

    expect(result).toMatchObject({ status: "ok", seasonLabel: "Kausi 2026" });
    expect(result.status === "ok" && result.facts).toContainEqual({
      kind: "run",
      run: "wins",
      length: 5,
    });
    expect(read).not.toHaveBeenCalledWith(
      expect.objectContaining({ competitionCode: "SC" }),
      expect.anything(),
      expect.anything()
    );
    for (const [, activeSeasonId, teamProviderId] of read.mock.calls) {
      expect([activeSeasonId, teamProviderId]).toEqual([2026, 1]);
    }
  });
});
