import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoissonFitResult } from "@/lib/poisson-service";
import type { SyncedSeasonMatches } from "@/lib/standings-service";
import type { SeasonTable } from "@/lib/taso-standings-service";

/**
 * The knockout forecast's service: which seasons have one, what it reads, the
 * stored ties it hands the simulation, a Suomen Cup's round of 16 and its
 * stand-in, the cache, and failure as its own case with its log line.
 *
 * decisions/067-knockout-simulation.md
 */

const mocks = vi.hoisted(() => ({
  getCachedUnlessDegraded: vi.fn(),
  getPoissonFit: vi.fn<(source: string) => Promise<PoissonFitResult>>(),
  getLeagueSeasonMatches:
    vi.fn<(code: string, season: number, active: number) => Promise<SyncedSeasonMatches>>(),
  loggerError: vi.fn(),
  getSeasonTables: vi.fn(),
  storedSeasonSides: vi.fn<(code: string, season: number) => Promise<Set<number>>>(),
}));

vi.mock("@/lib/cache", () => ({ getCachedUnlessDegraded: mocks.getCachedUnlessDegraded }));
vi.mock("@/lib/poisson-service", () => ({ getPoissonFit: mocks.getPoissonFit }));
vi.mock("@/lib/standings-service", () => ({
  getLeagueSeasonMatches: mocks.getLeagueSeasonMatches,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.loggerError } }));
vi.mock("@/lib/taso-standings-service", () => ({
  getSeasonTables: mocks.getSeasonTables,
  storedSeasonSides: mocks.storedSeasonSides,
}));

import { categoryIdForSeason, competitionIdForSeason } from "@/lib/domestic-competitions";
import {
  cupRound,
  fromLastSixteen,
  getCupForecast,
  getKnockoutForecast,
  hasCupForecast,
  knockoutCacheKey,
  storedTies,
} from "@/lib/knockout-simulation-service";
import { PLACEHOLDER_TEAM_ID } from "@/lib/match-detail";
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
    expect(mocks.getPoissonFit).not.toHaveBeenCalled();
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
    expect(row(10)?.expectedPoints).toBe(3);
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

  it("fails without a line of its own when the fit could not be read, which has logged it", async () => {
    mocks.getPoissonFit.mockResolvedValue({ status: "error" });
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

    expect(await forecast()).toEqual({ status: "error" });
    expect(mocks.loggerError).not.toHaveBeenCalled();
    expect(degraded).toBe(true);
  });

  it("says nothing is left once the final is awarded", async () => {
    read([...leaguePhase(), stored("FINAL", 1, 2, [3, 0], { status: "AWARDED" })]);

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

  it("counts an awarded leg's score as played", () => {
    const ties = storedTies([stored("LAST_16", 9, 1, [3, 0], { status: "AWARDED" })]);

    expect(ties.get("LAST_16")?.[0]?.legs[0]?.score).toEqual({ home: 3, away: 0 });
  });

  it("leaves out a leg that will not be played as listed", () => {
    const ties = storedTies([
      stored("LAST_16", 9, 1, [2, 1]),
      stored("LAST_16", 1, 9, null, { status: "CANCELLED" }),
    ]);

    expect(ties.get("LAST_16")?.[0]?.legs).toHaveLength(1);
  });

  it("sends through the leader of a tie whose every leg is settled", () => {
    const ties = storedTies([stored("FINAL", 1, 2, [0, 3], { status: "AWARDED" })]);

    expect(ties.get("FINAL")?.[0]?.winner).toBe(2);
  });

  it("leaves a two-legged tie missing its return leg undecided, however its first leg went", () => {
    const ties = storedTies([
      stored("LAST_16", 9, 1, [3, 0]),
      stored("LAST_16", 1, 9, null, { status: "CANCELLED" }),
    ]);

    expect(ties.get("LAST_16")?.[0]?.winner).toBeNull();
  });

  it("leaves a level tie with every leg settled to the provider's verdict", () => {
    const ties = storedTies([stored("FINAL", 1, 2, [1, 1], { status: "AWARDED" })]);

    expect(ties.get("FINAL")?.[0]?.winner).toBeNull();
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

type CupMatch = SeasonTable["matches"][number];
let nextCupMatch = 1;

// A cup match at its listed home side's ground; `winner` once TASO has played it.
function cupMatch(
  home: number,
  away: number,
  winner: "home" | "away" | null = null,
  score: [number, number] = winner === "home" ? [1, 0] : [0, 1]
): CupMatch {
  nextCupMatch += 1;
  return {
    providerMatchId: nextCupMatch,
    status: winner === null ? "SCHEDULED" : "FINISHED",
    homeTeamProviderId: home,
    homeTeamName: `Seura ${home}`,
    awayTeamProviderId: away,
    awayTeamName: `Seura ${away}`,
    homeGoals: winner === null ? null : score[0],
    awayGoals: winner === null ? null : score[1],
    winner,
  } as CupMatch;
}

function round(groupId: number, matches: CupMatch[]): SeasonTable {
  return { groupId, groupName: `Kierros ${groupId}`, matches } as SeasonTable;
}

// Each pair's first side its tie's home side, decided for it when `winner` is.
function pairs(sides: readonly number[], winner: "home" | "away" | null = null): CupMatch[] {
  return Array.from({ length: sides.length / 2 }, (_, index) =>
    cupMatch(sides[2 * index] as number, sides[2 * index + 1] as number, winner)
  );
}

const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);

// The round of 32, its home sides through, and the round of 16 to play: 101 to
// 116, the first six Veikkausliiga's.
const ROUND_OF_32 = round(
  1,
  pairs(
    range(101, 32).flatMap((side, i) => (i < 16 ? [side, side + 16] : [])),
    "home"
  )
);
const ROUND_OF_16 = round(2, pairs(range(101, 16)));
const TOP_DIVISION = new Set(range(101, 6));
const STAND_INS = [201, 202];

function cupFit(rated: readonly number[], standIn = { attack: 0, defence: 0 }): PoissonFit {
  const sides = [...rated, ...STAND_INS];
  const strength = (side: number, value: number) =>
    [side, STAND_INS.includes(side) ? value : 0] as [number, number];
  return {
    competitions: new Map([
      ["MSC", { base: 0.2, drawFactor: 1, cup: true }],
      ["NSC", { base: 0.2, drawFactor: 1, cup: true }],
    ]),
    home: 0.1,
    attack: new Map(sides.map((side) => strength(side, standIn.attack))),
    defence: new Map(sides.map((side) => strength(side, standIn.defence))),
  };
}

function storedSides(bySeason: Record<string, readonly number[]>) {
  mocks.storedSeasonSides.mockImplementation(
    async (code, season) => new Set(bySeason[`${code}:${season}`] ?? [])
  );
}

function cupSeason(tables: SeasonTable[], refreshFailed = false) {
  mocks.getSeasonTables.mockResolvedValue({ status: "ok", tables, refreshFailed });
}

const cupForecast = (code = "MSC") => getCupForecast(code, SEASON, SEASON);

function cupFitted(rated: readonly number[], standIn?: { attack: number; defence: number }) {
  mocks.getPoissonFit.mockResolvedValue({ status: "ok", fit: cupFit(rated, standIn) });
}

describe("cupRound", () => {
  const cupTies = (table: SeasonTable) => cupRound(table).ties;

  it("makes each match a tie, TASO's verdict its winner and its score once finished", () => {
    const [tie] = cupTies(round(3, [cupMatch(1, 2, "home", [2, 1])]));

    expect(tie).toEqual({
      key: `3:${nextCupMatch}`,
      home: { teamProviderId: 1, teamName: "Seura 1" },
      away: { teamProviderId: 2, teamName: "Seura 2" },
      winner: 1,
      legs: [{ home: 1, away: 2, score: { home: 2, away: 1 } }],
    });
  });

  it("reads a tie level after normal time from TASO's winner", () => {
    expect(cupTies(round(3, [cupMatch(1, 2, "away", [1, 1])]))[0]?.winner).toBe(2);
  });

  it("leaves a match not yet played undecided, with no score", () => {
    const [tie] = cupTies(round(3, [cupMatch(1, 2)]));

    expect(tie?.winner).toBeNull();
    expect(tie?.legs).toEqual([{ home: 1, away: 2, score: null }]);
  });

  it("leaves out a match with a side not yet known, and counts its sides in the round's size", () => {
    expect(
      cupRound(round(3, [cupMatch(PLACEHOLDER_TEAM_ID, 2), cupMatch(1, PLACEHOLDER_TEAM_ID)]))
    ).toEqual({ ties: [], size: 4 });
  });

  it("leaves a called-off match out of its ties and its size", () => {
    const called = { ...cupMatch(3, 4), status: "Abandoned" };

    expect(cupRound(round(3, [cupMatch(1, 2), called]))).toMatchObject({ size: 2 });
    expect(cupTies(round(3, [called]))).toEqual([]);
  });
});

describe("fromLastSixteen", () => {
  const ties = (table: SeasonTable) => cupRound(table);

  it("starts at the first round of sixteen sides or fewer with a top-division side, and takes each round that halves", () => {
    const quarterFinals = round(3, pairs(range(101, 8)));
    const rounds = [ROUND_OF_32, ROUND_OF_16, quarterFinals].map(ties);

    expect(fromLastSixteen(rounds, TOP_DIVISION)).toEqual(rounds.slice(1));
  });

  it("skips an early round of sixteen with no top-division side", () => {
    const early = round(1, pairs(range(301, 16)));
    const rounds = [early, ROUND_OF_32, ROUND_OF_16].map(ties);

    expect(fromLastSixteen(rounds, TOP_DIVISION)).toEqual([rounds[2]]);
  });

  it("skips a round whose sides are not a power of two", () => {
    const rounds = [round(1, pairs(range(101, 12))), ROUND_OF_16].map(ties);

    expect(fromLastSixteen(rounds, TOP_DIVISION)).toEqual([rounds[1]]);
  });

  it("counts a side not yet known, so a round of 32 with half its pairings unknown is not the round of 16", () => {
    const unknown = Array.from({ length: 8 }, () =>
      cupMatch(PLACEHOLDER_TEAM_ID, PLACEHOLDER_TEAM_ID)
    );
    const rounds = [round(1, [...pairs(range(101, 16)), ...unknown]), ROUND_OF_16].map(ties);

    expect(fromLastSixteen(rounds, TOP_DIVISION)).toEqual([rounds[1]]);
  });

  it("has nothing before the round of 16", () => {
    expect(fromLastSixteen([ROUND_OF_32].map(ties), TOP_DIVISION)).toEqual([]);
  });

  it("stops at a round that does not halve, and after the final", () => {
    const rounds = [ROUND_OF_16, round(3, pairs(range(101, 16)))].map(ties);
    const final = [round(5, pairs([101, 102])), round(6, pairs([101, 102]))].map(ties);

    expect(fromLastSixteen(rounds, TOP_DIVISION)).toEqual([rounds[0]]);
    expect(fromLastSixteen(final, TOP_DIVISION)).toEqual([final[0]]);
  });
});

describe("getCupForecast", () => {
  beforeEach(() => {
    cupSeason([ROUND_OF_32, ROUND_OF_16]);
    cupFitted(range(101, 32));
    storedSides({
      "VL:2026": [...TOP_DIVISION],
      "NL:2026": [...TOP_DIVISION],
      "M2:2026": STAND_INS,
      "N1:2026": STAND_INS,
    });
  });

  it("is had by the two Suomen Cups only", () => {
    expect(["MSC", "NSC", "VL", "LC"].map(hasCupForecast)).toEqual([true, true, false, false]);
  });

  it.each([
    ["VL", SEASON],
    ["MSC", SEASON - 1],
  ] as const)("has no section for %s %i, and reads nothing", async (code, season) => {
    expect(await getCupForecast(code, season, SEASON)).toEqual({ status: "unavailable" });
    expect(mocks.getSeasonTables).not.toHaveBeenCalled();
    expect(mocks.getPoissonFit).not.toHaveBeenCalled();
  });

  it("reads the cup as its standings page reads it, and TASO's fit, cached for 15 minutes", async () => {
    await cupForecast();

    expect(mocks.getSeasonTables).toHaveBeenCalledWith(
      categoryIdForSeason("MSC", SEASON),
      competitionIdForSeason("MSC", SEASON),
      SEASON,
      SEASON
    );
    expect(mocks.getPoissonFit).toHaveBeenCalledWith("taso");
    expect(mocks.getCachedUnlessDegraded).toHaveBeenCalledWith(
      "knockout:v1:taso:MSC:2026",
      900,
      expect.any(Function)
    );
  });

  it("forecasts from the round of 16: every side's chance of each round and of the cup", async () => {
    const result = await cupForecast();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.roundSizes).toEqual([16, 8, 4, 2]);
    expect(result.rows).toHaveLength(16);
    expect(result.ties).toHaveLength(8);
    expect(result.standIn).toBeNull();
    expect(mocks.storedSeasonSides).toHaveBeenCalledWith("VL", SEASON);
  });

  it("before the round of 16, gives only the undecided ties between two rated sides", async () => {
    cupSeason([round(1, [cupMatch(101, 117), cupMatch(102, 999), cupMatch(103, 118, "home")])]);

    const result = await cupForecast();

    expect(result.status).toBe("before");
    if (result.status !== "before") return;
    expect(result.ties.map((tie) => [tie.home.teamProviderId, tie.away.teamProviderId])).toEqual([
      [101, 117],
    ]);
  });

  it("between two rounds before the round of 16, has no tie to give", async () => {
    cupSeason([ROUND_OF_32]);

    expect(await cupForecast()).toEqual({ status: "before", ties: [] });
  });

  it("waits for every side of the round of 16, giving the current round's ties meanwhile", async () => {
    // One round of 32 tie still to play, so one round of 16 pairing is not known.
    const thirtyTwo = [
      ...pairs(
        range(101, 32).flatMap((side, i) => (i < 15 ? [side, side + 16] : [])),
        "home"
      ),
      cupMatch(116, 132),
    ];
    const sixteen = [...pairs(range(101, 14)), cupMatch(115, PLACEHOLDER_TEAM_ID)];
    cupSeason([round(1, thirtyTwo), round(2, sixteen)]);

    const result = await cupForecast();

    expect(result.status).toBe("before");
    if (result.status !== "before") return;
    expect(result.ties).toHaveLength(7);
    expect(result.ties.some((tie) => tie.away.teamProviderId === 132)).toBe(false);
  });

  it("gives a tie with an unrated side no figure, and names the division it counts as", async () => {
    cupFitted(range(101, 15));

    const result = await cupForecast();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.standIn).toBe("M2");
    expect(result.rows).toHaveLength(16);
    expect(result.ties.some((tie) => tie.away.teamProviderId === 116)).toBe(false);
    expect(result.ties).toHaveLength(7);
    const women = await cupForecast("NSC");
    expect(women.status === "ok" && women.standIn).toBe("N1");
  });

  it("plays an unrated side as the stand-in division's average side", async () => {
    // Kakkonen's sides far stronger than every rated side: 116 counts as one.
    cupFitted(range(101, 15), { attack: 3, defence: -3 });

    const result = await cupForecast();

    expect(result.status === "ok" && result.rows[0]?.teamProviderId).toBe(116);
  });

  it("gives the stand-in only to the simulation, so the fit every prediction reads is unchanged", async () => {
    const fit = cupFit(range(101, 15), { attack: 3, defence: -3 });
    mocks.getPoissonFit.mockResolvedValue({ status: "ok", fit });

    await cupForecast();

    expect(fit.attack.has(116)).toBe(false);
    expect(fit.defence.has(116)).toBe(false);
  });

  it("looks back for the stand-in division's latest season in the fit, as far as the fit reaches", async () => {
    cupFitted(range(101, 15), { attack: 3, defence: -3 });
    storedSides({ "VL:2026": [...TOP_DIVISION], "M2:2022": STAND_INS });

    const result = await cupForecast();

    expect(result.status === "ok" && result.rows[0]?.teamProviderId).toBe(116);
    storedSides({ "VL:2026": [...TOP_DIVISION] });
    await cupForecast();
    const seasons = mocks.storedSeasonSides.mock.calls
      .filter(([code]) => code === "M2")
      .map(([, season]) => season);
    expect(Math.min(...seasons)).toBe(2021);
  });

  it("names no division once every unrated side is out", async () => {
    cupFitted(range(101, 15));
    cupSeason([ROUND_OF_32, round(2, [...pairs(range(101, 14)), cupMatch(115, 116, "home")])]);

    const result = await cupForecast();

    expect(result.status === "ok" && result.standIn).toBeNull();
  });

  it("says nothing is left once the final is decided", async () => {
    const rounds = [
      ROUND_OF_32,
      round(2, pairs(range(101, 16), "home")),
      round(3, pairs([101, 103, 105, 107, 109, 111, 113, 115], "home")),
      round(4, pairs([101, 105, 109, 113], "home")),
      round(5, pairs([101, 109], "home")),
    ];
    cupSeason(rounds);

    expect(await cupForecast()).toEqual({ status: "no-fixtures" });
  });

  it("forecasts on when the last stored round is a played semi-final whose other is not known", async () => {
    cupSeason([
      ROUND_OF_32,
      round(2, pairs(range(101, 16), "home")),
      round(3, pairs([101, 103, 105, 107, 109, 111, 113, 115], "home")),
      round(4, [cupMatch(101, 105, "home"), cupMatch(109, PLACEHOLDER_TEAM_ID)]),
    ]);

    const result = await cupForecast();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.rows.map((row) => row.teamProviderId).toSorted()).toEqual([101, 109, 113]);
  });

  it.each([
    ["nothing is stored", () => mocks.getSeasonTables.mockResolvedValue({ status: "empty" })],
    [
      "the fit has no match of the cup",
      () =>
        mocks.getPoissonFit.mockResolvedValue({
          status: "ok",
          fit: { ...cupFit([]), competitions: new Map() },
        }),
    ],
  ])("has no section when %s", async (_case, arrange) => {
    arrange();

    expect(await cupForecast()).toEqual({ status: "unavailable" });
  });

  it("fails without a line of its own when the fit could not be read, which has logged it", async () => {
    mocks.getPoissonFit.mockResolvedValue({ status: "error" });

    expect(await cupForecast()).toEqual({ status: "error" });
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it("fails, with one error line, when the cup could not be read", async () => {
    mocks.getSeasonTables.mockResolvedValue({ status: "error" });

    expect(await cupForecast()).toEqual({ status: "error" });
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "taso",
        code: "MSC",
        seasonId: SEASON,
        err: expect.any(Error),
      }),
      "Unable to simulate the knockout"
    );
  });

  it.each([
    [false, false],
    [true, true],
  ])(
    "marks a forecast from rows TASO could not refresh as not to be kept (refresh failed: %s)",
    async (failed, degraded) => {
      cupSeason([ROUND_OF_32, ROUND_OF_16], failed);
      let seen: boolean | undefined;
      mocks.getCachedUnlessDegraded.mockImplementation(
        async (
          _key: string,
          _ttl: number,
          fetcher: () => Promise<{ value: unknown; degraded: boolean }>
        ) => {
          const fetched = await fetcher();
          seen = fetched.degraded;
          return fetched.value;
        }
      );

      await cupForecast();
      expect(seen).toBe(degraded);
    }
  );
});
