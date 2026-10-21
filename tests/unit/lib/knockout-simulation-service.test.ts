import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoissonFitResult } from "@/lib/poisson-service";
import type { SyncedSeasonMatches } from "@/lib/standings-service";

/**
 * The knockout forecast's service: which seasons have one, what it reads, the
 * stored ties it hands the simulation, the cache, and failure as its own case
 * with its log line.
 *
 * decisions/067-knockout-simulation.md
 */

const mocks = vi.hoisted(() => ({
  getCachedUnlessDegraded: vi.fn(),
  getPoissonFit: vi.fn<(source: string) => Promise<PoissonFitResult>>(),
  getLeagueSeasonMatches:
    vi.fn<(code: string, season: number, active: number) => Promise<SyncedSeasonMatches>>(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({ getCachedUnlessDegraded: mocks.getCachedUnlessDegraded }));
vi.mock("@/lib/poisson-service", () => ({ getPoissonFit: mocks.getPoissonFit }));
vi.mock("@/lib/standings-service", () => ({
  getLeagueSeasonMatches: mocks.getLeagueSeasonMatches,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.loggerError } }));

import {
  getKnockoutForecast,
  knockoutCacheKey,
  storedTies,
} from "@/lib/knockout-simulation-service";
import type { PoissonFit } from "@/lib/poisson";

const SEASON = 2026;

// Every side an average one: the Champions League predicts a side the fit has
// no match of as average.
const fit: PoissonFit = {
  competitions: new Map([["CL", { base: 0.2, drawFactor: 1 }]]),
  home: 0.25,
  attack: new Map(),
  defence: new Map(),
};

type Stored = SyncedSeasonMatches["matches"][number];
let nextId = 1;
function stored(
  stage: string,
  home: number,
  away: number,
  score: [number, number] | null,
  overrides: Partial<Stored> = {}
): Stored {
  nextId += 1;
  return {
    providerMatchId: nextId,
    competitionCode: "CL",
    seasonId: SEASON,
    kickoffAt: new Date(Date.UTC(2026, 8, 1) + nextId * 60_000),
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
    stage,
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

// A league phase of 36: side n has beaten side n + 18, and the two left to
// play each other are 1 and 36.
function leaguePhase(): Stored[] {
  const played = Array.from({ length: 18 }, (_, index) =>
    stored("LEAGUE_STAGE", index + 1, index + 19, [1, 0])
  );
  return [...played, stored("LEAGUE_STAGE", 1, 36, null)];
}

function read(matches: Stored[], refreshFailed = false) {
  mocks.getLeagueSeasonMatches.mockResolvedValue({ matches, refreshFailed });
}

const forecast = () => getKnockoutForecast("football-data", "CL", SEASON, SEASON);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCachedUnlessDegraded.mockImplementation(
    async (_key: string, _ttl: number, fetcher: () => Promise<{ value: unknown }>) =>
      (await fetcher()).value
  );
  mocks.getPoissonFit.mockResolvedValue({ status: "ok", fit });
  read(leaguePhase());
});

describe("getKnockoutForecast", () => {
  it.each([
    ["taso", "CL", SEASON],
    ["football-data", "PL", SEASON],
    ["football-data", "CL", SEASON - 1],
  ] as const)("has no panel for %s %s %i, and reads nothing", async (kind, code, season) => {
    expect(await getKnockoutForecast(kind, code, season, SEASON)).toEqual({
      status: "unavailable",
    });
    expect(mocks.getLeagueSeasonMatches).not.toHaveBeenCalled();
  });

  it("reads the season as the standings page reads it, cached for 15 minutes", async () => {
    await forecast();

    expect(mocks.getLeagueSeasonMatches).toHaveBeenCalledWith("CL", SEASON, SEASON);
    expect(mocks.getPoissonFit).toHaveBeenCalledWith("football-data");
    expect(mocks.getCachedUnlessDegraded).toHaveBeenCalledWith(
      "knockout:v1:football-data:CL:2026",
      900,
      expect.any(Function)
    );
  });

  it("names its cache entry by provider, competition and season", () => {
    expect(knockoutCacheKey("taso", "MSC", 2027)).toBe("knockout:v1:taso:MSC:2027");
  });

  it("forecasts the league phase from its own matches and its remaining fixtures", async () => {
    // A knockout tie stored while the league phase has a fixture left is not one of them.
    read([...leaguePhase(), stored("PLAYOFFS", 20, 10, null)]);
    const result = await forecast();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.leaguePhase).toHaveLength(36);
    // 1 to 18 have three points, 19 to 36 none: 36's fixture against 1 is
    // the only one, so it can still reach the play-offs but not the top eight.
    const row = (team: number) =>
      result.leaguePhase?.find((candidate) => candidate.teamProviderId === team);
    expect(row(2)?.expectedPoints).toBe(3);
    expect(row(36)?.zones[0]).toEqual({ share: 0, settled: true });
    expect(row(36)?.zones[1]?.settled).toBe(false);
  });

  it("hands the simulation the stored ties, the provider's winner as it is", async () => {
    const finished = { regularTimeHome: 1, regularTimeAway: 1 };
    const shootOut = { penaltiesHome: 4, penaltiesAway: 3 };
    read([
      ...leaguePhase().map((match) => ({
        ...match,
        status: "FINISHED",
        homeGoals: 1,
        awayGoals: 0,
      })),
      stored("PLAYOFFS", 20, 10, [1, 1], finished),
      stored("PLAYOFFS", 10, 20, [1, 1], { ...finished, ...shootOut }),
    ]);
    const result = await forecast();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.rows.find((row) => row.teamProviderId === 20)).toBeUndefined();
    expect(result.rows.find((row) => row.teamProviderId === 10)?.reached[0]).toEqual({
      share: 1,
      settled: true,
    });
  });

  it("says nothing is left once the final is decided", async () => {
    read([...leaguePhase(), stored("FINAL", 1, 2, [2, 0])]);

    expect(await forecast()).toEqual({ status: "no-fixtures" });
  });

  it("has no panel for a season of the group-stage format", async () => {
    read([stored("GROUP_STAGE", 1, 2, [1, 0], { groupName: "GROUP_A" })]);

    expect(await forecast()).toEqual({ status: "unavailable" });
  });

  it("has no panel when the fit has no match of the competition", async () => {
    mocks.getPoissonFit.mockResolvedValue({
      status: "ok",
      fit: { ...fit, competitions: new Map() },
    });

    expect(await forecast()).toEqual({ status: "unavailable" });
  });

  it("has no panel when nothing is stored", async () => {
    read([]);

    expect(await forecast()).toEqual({ status: "unavailable" });
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it("does not keep a forecast made from stored rows the provider could not refresh", async () => {
    read(leaguePhase(), true);
    let degraded: boolean | undefined;
    mocks.getCachedUnlessDegraded.mockImplementation(
      async (
        _key: string,
        _ttl: number,
        fetcher: () => Promise<{ value: unknown; degraded: boolean }>
      ) => {
        const fetched = await fetcher();
        degraded = fetched.degraded;
        return fetched.value;
      }
    );

    expect((await forecast()).status).toBe("ok");
    expect(degraded).toBe(true);
  });

  it.each([
    ["nothing is stored and the refresh failed", () => read([], true)],
    ["the fit could not be read", () => mocks.getPoissonFit.mockResolvedValue({ status: "error" })],
    [
      "the fit cannot predict a pairing",
      () =>
        mocks.getPoissonFit.mockResolvedValue({
          status: "ok",
          fit: { ...fit, competitions: new Map([["CL", { base: 0.2, drawFactor: 1, cup: true }]]) },
        }),
    ],
  ])("fails, with one error line, when %s", async (_case, arrange) => {
    arrange();

    expect(await forecast()).toEqual({ status: "error" });
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "football-data",
        code: "CL",
        seasonId: SEASON,
        err: expect.any(Error),
      }),
      "Unable to simulate the knockout"
    );
  });
});

describe("storedTies", () => {
  it("gives each leg its score only once it is finished", () => {
    const ties = storedTies([
      stored("LAST_16", 9, 1, [2, 1]),
      stored("LAST_16", 1, 9, [1, 0], { status: "IN_PLAY" }),
    ]);

    expect(ties.get("LAST_16")?.[0]?.legs.map((leg) => leg.score)).toEqual([
      { home: 2, away: 1 },
      null,
    ]);
  });

  it("leaves out a tie with a side not yet known", () => {
    const ties = storedTies([stored("LAST_16", 0, 1, null), stored("LAST_16", 9, 2, null)]);

    expect(ties.get("LAST_16")?.map((tie) => tie.home.teamProviderId)).toEqual([9]);
  });

  it("keeps the bracket's verdict on a decided tie", () => {
    const ties = storedTies([stored("FINAL", 1, 2, [0, 3])]);

    expect(ties.get("FINAL")?.[0]?.winner).toBe(2);
  });
});
