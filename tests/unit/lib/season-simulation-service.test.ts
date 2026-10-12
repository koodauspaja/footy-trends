import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoissonFitResult } from "@/lib/poisson-service";
import type { SyncedSeasonMatches } from "@/lib/standings-service";
import type { SeasonTable } from "@/lib/taso-standings-service";

/**
 * The season forecast's service: which seasons have one, what it reads for
 * each provider, which matches are fixtures, the layout it picks, the cache,
 * and failure as its own case with its log line.
 *
 * decisions/061-season-simulation.md
 */

const mocks = vi.hoisted(() => ({
  getCachedUnlessDegraded: vi.fn(),
  getPoissonFit: vi.fn<(source: string) => Promise<PoissonFitResult>>(),
  getLeagueSeasonMatches:
    vi.fn<(code: string, season: number, active: number) => Promise<SyncedSeasonMatches>>(),
  getSeasonTables:
    vi.fn<
      (
        categoryId: string,
        competitionId: string,
        season: number,
        active: number
      ) => Promise<
        | { status: "ok"; tables: SeasonTable[]; refreshFailed: boolean }
        | { status: "empty" | "error" }
      >
    >(),
  hasCarryOver: vi.fn<(categoryId: string, competitionId: string) => boolean>(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({ getCachedUnlessDegraded: mocks.getCachedUnlessDegraded }));
vi.mock("@/lib/poisson-service", () => ({ getPoissonFit: mocks.getPoissonFit }));
vi.mock("@/lib/standings-service", () => ({
  getLeagueSeasonMatches: mocks.getLeagueSeasonMatches,
}));
vi.mock("@/lib/taso-standings-service", () => ({
  getSeasonTables: mocks.getSeasonTables,
  hasCarryOver: mocks.hasCarryOver,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.loggerError } }));

import { type PoissonFit, predictPoisson } from "@/lib/poisson";
import { seasonForecast } from "@/lib/season-simulation";
import { getSeasonForecast } from "@/lib/season-simulation-service";

const SEASON = 2026;

// Team 1 is strong, team 3 weak; both competitions are in the fit.
const fit: PoissonFit = {
  competitions: new Map([
    ["PL", { base: 0.2, drawFactor: 1 }],
    ["VL", { base: 0.1, drawFactor: 1.1 }],
  ]),
  home: 0.25,
  attack: new Map([
    [1, 0.5],
    [3, -0.4],
  ]),
  defence: new Map([
    [1, -0.3],
    [3, 0.3],
  ]),
};
const predictWith = (code: string) => (home: number, away: number) =>
  predictPoisson(fit, code, home, away);

type Stored = SyncedSeasonMatches["matches"][number];
let nextId = 1;
function stored(
  home: number,
  away: number,
  score: [number, number] | null,
  overrides: Partial<Stored> = {}
): Stored {
  nextId += 1;
  return {
    providerMatchId: nextId,
    competitionCode: "PL",
    seasonId: SEASON,
    kickoffAt: new Date("2026-09-01T14:00:00Z"),
    matchday: 1,
    status: score === null ? "TIMED" : "FINISHED",
    homeTeamProviderId: home,
    homeTeamName: `Team ${home}`,
    awayTeamProviderId: away,
    awayTeamName: `Team ${away}`,
    homeGoals: score?.[0] ?? null,
    awayGoals: score?.[1] ?? null,
    halfTimeHome: null,
    halfTimeAway: null,
    stage: "REGULAR_SEASON",
    groupName: null,
    regularTimeHome: null,
    regularTimeAway: null,
    extraTimeHome: null,
    extraTimeAway: null,
    penaltiesHome: null,
    penaltiesAway: null,
    ...overrides,
  } as Stored;
}

function row(teamProviderId: number, points: number) {
  return { teamProviderId, teamName: `Team ${teamProviderId}`, points };
}

type GroupMatch = SeasonTable["matches"][number];
function groupMatch(home: number, away: number, status = "SCHEDULED"): GroupMatch {
  return { status, homeTeamProviderId: home, awayTeamProviderId: away } as GroupMatch;
}

function group(overrides: Partial<SeasonTable> & { groupId: number }): SeasonTable {
  return {
    groupName: `Group ${overrides.groupId}`,
    kind: "own-calculated",
    standings: [row(1, 3), row(3, 0)] as unknown as SeasonTable["standings"],
    matches: [groupMatch(1, 3)],
    parentGroupId: null,
    ...overrides,
  };
}

// The cache as a miss: the fetcher's value as it would come back out of Redis.
async function miss(
  _key: string,
  _ttl: number,
  fetcher: () => Promise<{ value: unknown; degraded: boolean }>
) {
  return JSON.parse(JSON.stringify((await fetcher()).value));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCachedUnlessDegraded.mockReset().mockImplementation(miss);
  mocks.getPoissonFit.mockReset().mockResolvedValue({ status: "ok", fit });
  mocks.getLeagueSeasonMatches.mockReset();
  mocks.getSeasonTables.mockReset();
  mocks.hasCarryOver.mockReset().mockReturnValue(false);
});

describe("which seasons have a forecast", () => {
  it("has none for a season that is not the one in progress, and reads nothing", async () => {
    expect(await getSeasonForecast("football-data", "PL", 2025, SEASON)).toEqual({
      status: "unavailable",
    });
    expect(mocks.getCachedUnlessDegraded).not.toHaveBeenCalled();
    expect(mocks.getLeagueSeasonMatches).not.toHaveBeenCalled();
  });

  it.each([
    ["football-data", "CL"],
    ["taso", "SC"],
  ] as const)(
    "has none for %s %s, which is not a league, and reads nothing",
    async (kind, code) => {
      expect(await getSeasonForecast(kind, code, SEASON, SEASON)).toEqual({
        status: "unavailable",
      });
      expect(mocks.getCachedUnlessDegraded).not.toHaveBeenCalled();
      expect(mocks.getPoissonFit).not.toHaveBeenCalled();
    }
  );
});

describe("a football-data league", () => {
  const played = [stored(1, 2, [2, 0]), stored(3, 2, [1, 1])];

  it("simulates the regular season's table and fixtures with the provider's fit", async () => {
    const fixtures = [stored(3, 1, null), stored(2, 1, null, { status: "SCHEDULED" })];
    mocks.getLeagueSeasonMatches.mockResolvedValue({
      matches: [...played, ...fixtures],
      refreshFailed: false,
    });

    const forecast = await getSeasonForecast("football-data", "PL", SEASON, SEASON);

    expect(mocks.getLeagueSeasonMatches).toHaveBeenCalledWith("PL", SEASON, SEASON);
    expect(mocks.getPoissonFit).toHaveBeenCalledWith("football-data");
    expect(forecast).toEqual(
      seasonForecast(
        "single",
        [
          {
            groupName: null,
            simulated: true,
            // Teams 2 and 3 drew, and team 2 lost to team 1 by two.
            rows: [row(1, 3), row(3, 1), row(2, 1)],
            fixtures: [
              { homeTeam: 3, awayTeam: 1 },
              { homeTeam: 2, awayTeam: 1 },
            ],
          },
        ],
        predictWith("PL")
      )
    );
    expect(forecast.status).toBe("ok");
  });

  it("keeps a play-off match out of the table and out of the fixtures", async () => {
    mocks.getLeagueSeasonMatches.mockResolvedValue({
      matches: [
        ...played,
        stored(3, 1, null),
        stored(2, 3, [5, 0], { stage: "PLAYOFFS" }),
        stored(1, 2, null, { stage: "FINAL" }),
      ],
      refreshFailed: false,
    });

    expect(await getSeasonForecast("football-data", "PL", SEASON, SEASON)).toEqual(
      seasonForecast(
        "single",
        [
          {
            groupName: null,
            simulated: true,
            rows: [row(1, 3), row(3, 1), row(2, 1)],
            fixtures: [{ homeTeam: 3, awayTeam: 1 }],
          },
        ],
        predictWith("PL")
      )
    );
  });

  it("counts a match stored without a stage as the league's own", async () => {
    mocks.getLeagueSeasonMatches.mockResolvedValue({
      matches: [stored(1, 2, [1, 0], { stage: null }), stored(2, 1, null, { stage: null })],
      refreshFailed: false,
    });

    expect(await getSeasonForecast("football-data", "PL", SEASON, SEASON)).toEqual(
      seasonForecast(
        "single",
        [
          {
            groupName: null,
            simulated: true,
            rows: [row(1, 3), row(2, 0)],
            fixtures: [{ homeTeam: 2, awayTeam: 1 }],
          },
        ],
        predictWith("PL")
      )
    );
  });

  it("plays out a postponed match and not a cancelled or an awarded one", async () => {
    mocks.getLeagueSeasonMatches.mockResolvedValue({
      matches: [
        ...played,
        stored(1, 3, null, { status: "POSTPONED" }),
        stored(2, 3, null, { status: "CANCELLED" }),
        stored(2, 1, null, { status: "AWARDED" }),
      ],
      refreshFailed: false,
    });

    expect(await getSeasonForecast("football-data", "PL", SEASON, SEASON)).toEqual(
      seasonForecast(
        "single",
        [
          {
            groupName: null,
            simulated: true,
            rows: [row(1, 3), row(3, 1), row(2, 1)],
            fixtures: [{ homeTeam: 1, awayTeam: 3 }],
          },
        ],
        predictWith("PL")
      )
    );
  });

  it("says nothing is left when every match is played", async () => {
    mocks.getLeagueSeasonMatches.mockResolvedValue({ matches: played, refreshFailed: false });

    expect(await getSeasonForecast("football-data", "PL", SEASON, SEASON)).toEqual({
      status: "no-fixtures",
    });
  });

  it("has no panel when nothing is stored for the season", async () => {
    mocks.getLeagueSeasonMatches.mockResolvedValue({ matches: [], refreshFailed: false });

    expect(await getSeasonForecast("football-data", "PL", SEASON, SEASON)).toEqual({
      status: "unavailable",
    });
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it("has no panel when the fit holds no match of the competition", async () => {
    mocks.getLeagueSeasonMatches.mockResolvedValue({
      matches: [...played, stored(3, 1, null)],
      refreshFailed: false,
    });

    expect(await getSeasonForecast("football-data", "SA", SEASON, SEASON)).toEqual({
      status: "unavailable",
    });
  });
});

describe("the cache", () => {
  it("keeps one forecast per provider, competition and season for 15 minutes", async () => {
    mocks.getLeagueSeasonMatches.mockResolvedValue({ matches: [], refreshFailed: false });
    mocks.getSeasonTables.mockResolvedValue({ status: "empty" });

    await getSeasonForecast("football-data", "PL", SEASON, SEASON);
    await getSeasonForecast("taso", "VL", SEASON, SEASON);

    expect(mocks.getCachedUnlessDegraded.mock.calls.map(([key, ttl]) => [key, ttl])).toEqual([
      ["forecast:v1:football-data:PL:2026", 900],
      ["forecast:v1:taso:VL:2026", 900],
    ]);
  });

  it("answers from the cache without reading the season or the fit", async () => {
    mocks.getCachedUnlessDegraded.mockResolvedValue({ status: "no-fixtures" });

    expect(await getSeasonForecast("football-data", "PL", SEASON, SEASON)).toEqual({
      status: "no-fixtures",
    });
    expect(mocks.getLeagueSeasonMatches).not.toHaveBeenCalled();
    expect(mocks.getPoissonFit).not.toHaveBeenCalled();
  });

  it.each([
    [true, "a forecast from stored rows the provider could not refresh is not kept"],
    [false, "a forecast from a fresh read is kept"],
  ])("marks the value degraded: %s — %s", async (refreshFailed) => {
    const fetched: Array<{ degraded: boolean }> = [];
    mocks.getCachedUnlessDegraded.mockImplementation(async (_key, _ttl, fetcher) => {
      const result = await fetcher();
      fetched.push(result);
      return result.value;
    });
    mocks.getLeagueSeasonMatches.mockResolvedValue({
      matches: [stored(1, 2, [1, 0]), stored(2, 1, null)],
      refreshFailed,
    });

    const forecast = await getSeasonForecast("football-data", "PL", SEASON, SEASON);

    expect(forecast.status).toBe("ok");
    expect(fetched.map((result) => result.degraded)).toEqual([refreshFailed]);
  });
});

describe("the cache, for a domestic league", () => {
  it.each([
    [true, "a forecast from stored rows TASO could not refresh is not kept"],
    [false, "a forecast from a fresh read is kept"],
  ])("marks the value degraded: %s — %s", async (refreshFailed) => {
    const fetched: Array<{ degraded: boolean }> = [];
    mocks.getCachedUnlessDegraded.mockImplementation(async (_key, _ttl, fetcher) => {
      const result = await fetcher();
      fetched.push(result);
      return result.value;
    });
    mocks.getSeasonTables.mockResolvedValue({
      status: "ok",
      tables: [group({ groupId: 1 })],
      refreshFailed,
    });

    const forecast = await getSeasonForecast("taso", "VL", SEASON, SEASON);

    expect(forecast.status).toBe("ok");
    expect(fetched.map((result) => result.degraded)).toEqual([refreshFailed]);
  });
});

describe("failure", () => {
  // The line says which read failed, in the error it carries.
  const logged = (source: string, code: string, message: string) => [
    {
      err: expect.objectContaining({ message }),
      source,
      code,
      seasonId: SEASON,
    },
    "Unable to simulate the season",
  ];

  it("is its own case when the season cannot be read at all, and is logged", async () => {
    mocks.getLeagueSeasonMatches.mockResolvedValue({ matches: [], refreshFailed: true });

    expect(await getSeasonForecast("football-data", "PL", SEASON, SEASON)).toEqual({
      status: "error",
    });
    expect(mocks.loggerError.mock.calls).toEqual([
      logged("football-data", "PL", "The season's matches could not be read"),
    ]);
  });

  it("is its own case when the fit cannot be read, and is logged", async () => {
    mocks.getLeagueSeasonMatches.mockResolvedValue({
      matches: [stored(1, 2, [1, 0]), stored(2, 1, null)],
      refreshFailed: false,
    });
    mocks.getPoissonFit.mockResolvedValue({ status: "error" });

    expect(await getSeasonForecast("football-data", "PL", SEASON, SEASON)).toEqual({
      status: "error",
    });
    expect(mocks.loggerError.mock.calls).toEqual([
      logged("football-data", "PL", "The Poisson fit could not be read"),
    ]);
  });

  it("is its own case when a domestic season's tables cannot be read, and is logged", async () => {
    mocks.getSeasonTables.mockResolvedValue({ status: "error" });

    expect(await getSeasonForecast("taso", "VL", SEASON, SEASON)).toEqual({ status: "error" });
    expect(mocks.loggerError.mock.calls).toEqual([
      logged("taso", "VL", "The season's tables could not be read"),
    ]);
  });

  it("is its own case when a read throws, and is logged", async () => {
    mocks.getSeasonTables.mockRejectedValue(new Error("connection refused"));

    expect(await getSeasonForecast("taso", "VL", SEASON, SEASON)).toEqual({ status: "error" });
    expect(mocks.loggerError.mock.calls).toEqual([logged("taso", "VL", "connection refused")]);
  });
});

describe("a domestic league", () => {
  function tablesOf(...tables: SeasonTable[]) {
    mocks.getSeasonTables.mockResolvedValue({ status: "ok", tables, refreshFailed: false });
  }
  const asInput = (table: SeasonTable, simulated = true) => ({
    groupName: table.groupName,
    simulated,
    rows: table.standings.map(({ teamProviderId, teamName, points }) => ({
      teamProviderId,
      teamName,
      points,
    })),
    fixtures: [{ homeTeam: 1, awayTeam: 3 }],
  });

  it("reads the season under its own category and competition ids, with the domestic fit", async () => {
    tablesOf(group({ groupId: 1 }));

    await getSeasonForecast("taso", "VL", SEASON, SEASON);

    expect(mocks.getSeasonTables).toHaveBeenCalledWith("VL", "spljp26", SEASON, SEASON);
    expect(mocks.getPoissonFit).toHaveBeenCalledWith("taso");
  });

  it("simulates a season with one table as a single table", async () => {
    const only = group({ groupId: 1 });
    tablesOf(only);

    expect(await getSeasonForecast("taso", "VL", SEASON, SEASON)).toMatchObject(
      seasonForecast("single", [asInput(only)], predictWith("VL"))
    );
  });

  it("does not count a match list as a table when telling one table from several", async () => {
    const only = group({ groupId: 1 });
    tablesOf(only, group({ groupId: 5, kind: "match-list", standings: [] }));

    const forecast = await getSeasonForecast("taso", "VL", SEASON, SEASON);

    expect(forecast).toMatchObject({ status: "ok", layout: "single" });
    expect(forecast.status === "ok" && forecast.tables).toHaveLength(1);
  });

  it("after a split simulates each continuation group and drops the group they continue", async () => {
    const upper = group({ groupId: 2, groupName: "Mestaruussarja", parentGroupId: 1 });
    const lower = group({ groupId: 3, groupName: "Karsintasarja", parentGroupId: 1 });
    tablesOf(group({ groupId: 1, groupName: "Runkosarja", matches: [] }), upper, lower);
    mocks.hasCarryOver.mockReturnValue(true);

    const forecast = await getSeasonForecast("taso", "VL", SEASON, SEASON);

    expect(forecast).toMatchObject(
      seasonForecast("several", [asInput(upper), asInput(lower)], predictWith("VL"))
    );
    expect(forecast.status === "ok" && forecast.tables.map((table) => table.groupName)).toEqual([
      "Mestaruussarja",
      "Karsintasarja",
    ]);
  });

  it("shows a lone continuation group as one of several, not as the league's single table", async () => {
    // Kansallinen Liiga's shape: the regular season, then one group of its top six.
    const upper = group({ groupId: 2, groupName: "Mestaruussarja", parentGroupId: 1 });
    tablesOf(group({ groupId: 1, groupName: "Runkosarja", matches: [] }), upper);

    const forecast = await getSeasonForecast("taso", "VL", SEASON, SEASON);

    expect(forecast).toMatchObject({ status: "ok", layout: "several" });
    expect(forecast.status === "ok" && forecast.tables.map((table) => table.groupName)).toEqual([
      "Mestaruussarja",
    ]);
  });

  it("plays out only a group's own remaining matches", async () => {
    const pool = group({
      groupId: 1,
      matches: [
        groupMatch(1, 3, "FINISHED"),
        groupMatch(1, 3, "Abandoned"),
        groupMatch(3, 1, "SCHEDULED"),
      ],
    });
    tablesOf(pool, group({ groupId: 2 }));

    expect(await getSeasonForecast("taso", "VL", SEASON, SEASON)).toMatchObject(
      seasonForecast(
        "several",
        [
          { ...asInput(pool), fixtures: [{ homeTeam: 3, awayTeam: 1 }] },
          asInput(group({ groupId: 2 })),
        ],
        predictWith("VL")
      )
    );
  });

  it("leaves a pass-through group out, and says so when it is the only table", async () => {
    const ours = group({ groupId: 1 });
    const theirs = group({ groupId: 2, kind: "pass-through", standings: [] });
    tablesOf(ours, theirs);
    const mixed = await getSeasonForecast("taso", "VL", SEASON, SEASON);
    expect(mixed.status === "ok" && mixed.tables.map((table) => table.groupName)).toEqual([
      "Group 1",
    ]);
    expect(mixed).toMatchObject({ layout: "several" });

    tablesOf(theirs);
    expect(await getSeasonForecast("taso", "VL", SEASON, SEASON)).toEqual({
      status: "not-simulated",
    });
  });

  it("is before a split when last season split and this one has no continuation group yet", async () => {
    const regular = group({ groupId: 1, groupName: "Runkosarja" });
    tablesOf(regular);
    mocks.hasCarryOver.mockReturnValue(true);

    const forecast = await getSeasonForecast("taso", "VL", SEASON, SEASON);

    expect(mocks.hasCarryOver.mock.calls).toEqual([["VL", "spljp25"]]);
    expect(forecast).toMatchObject(
      seasonForecast("before-split", [asInput(regular)], predictWith("VL"))
    );
    expect(forecast).toMatchObject({ layout: "before-split" });
  });

  it("is not before a split when last season did not split", async () => {
    tablesOf(group({ groupId: 1 }), group({ groupId: 2 }));

    expect(await getSeasonForecast("taso", "VL", SEASON, SEASON)).toMatchObject({
      layout: "several",
    });
  });

  it("has no panel when nothing is stored for the season", async () => {
    mocks.getSeasonTables.mockResolvedValue({ status: "empty" });

    expect(await getSeasonForecast("taso", "VL", SEASON, SEASON)).toEqual({
      status: "unavailable",
    });
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});
