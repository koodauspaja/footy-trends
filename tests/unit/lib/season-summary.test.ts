import { describe, expect, it, vi } from "vitest";
import type { ResultMatch } from "@/lib/form-series";
import type { SideStats } from "@/lib/home-away";
import type { SeasonKey, SeasonRead, SeasonReadResult } from "@/lib/season-comparison";
import {
  isFavourable,
  rankFacts,
  runFacts,
  type SideFact,
  type SummaryFact,
  type SummaryReaders,
  seasonSummaryFor,
  shownPointsPerMatch,
  sideFact,
  upsetFact,
} from "@/lib/season-summary";
import {
  type RecordSeason,
  type StreakRecords,
  type StreakRecordsSeries,
  streakRecords,
} from "@/lib/streak-records";
import type { Surprise } from "@/lib/surprise";

/**
 * The block's detectors at their boundaries, its ranking, and the orchestrator
 * deciding which season gets a block and what it reads.
 *
 * decisions/066-season-summary.md
 */

const TEAM = 1;
const OTHER = 2;

// One side's counts: `won` and `drawn` of `matches`, the rest lost.
function side(matches: number, won: number, drawn = 0): SideStats {
  return { matches, won, drawn, lost: matches - won - drawn, scored: 0, conceded: 0 };
}

const NO_RECORDS: StreakRecords = { wins: null, unbeaten: null, defeats: null, winless: null };

function upset(probability: number): Surprise {
  return {
    providerMatchId: 77,
    kickoffAt: new Date("2026-05-01T15:00:00Z"),
    homeTeamProviderId: OTHER,
    homeTeamName: "KuPS",
    awayTeamProviderId: TEAM,
    awayTeamName: "AC Oulu",
    homeGoals: 0,
    awayGoals: 1,
    home: 0.6,
    draw: 0.24,
    away: probability,
    probability,
  };
}

function homeFact(beaten: number, direction: SideFact["direction"] = "best"): SideFact {
  return { kind: "home", direction, pointsPerMatch: 2, beaten, everySeason: false };
}

function awayFact(beaten: number, direction: SideFact["direction"] = "best"): SideFact {
  return { kind: "away", direction, pointsPerMatch: 2, beaten, everySeason: false };
}

describe("shownPointsPerMatch", () => {
  it("rounds to the two decimals the home and away panel prints", () => {
    // Two points in three matches is 0,666…, printed 0,67, as 67 points in 100 are.
    expect(shownPointsPerMatch(side(3, 0, 2))).toBe(0.67);
    expect(shownPointsPerMatch(side(100, 22, 1))).toBe(0.67);
    expect(shownPointsPerMatch(side(25, 16, 1))).toBe(1.96);
  });

  it("has no figure for a side with no match", () => {
    expect(shownPointsPerMatch(side(0, 0))).toBeNull();
  });
});

describe("sideFact", () => {
  const weaker = [side(10, 5), side(10, 4), side(10, 3)];

  it("needs three earlier seasons, not two", () => {
    expect(sideFact("home", side(5, 5), weaker)).toMatchObject({ beaten: 3, everySeason: true });
    expect(sideFact("home", side(5, 5), weaker.slice(0, 2))).toBeNull();
  });

  it("needs five matches on its side, not four", () => {
    expect(sideFact("home", side(5, 4), weaker)).not.toBeNull();
    expect(sideFact("home", side(4, 4), weaker)).toBeNull();
  });

  it("counts the earlier seasons beaten in a row, newest first", () => {
    const fact = sideFact("away", side(5, 4), [...weaker, side(10, 10), side(10, 1)]);

    // 2,40 beats 1,50, 1,20 and 0,90, then stops at 3,00, so the 0,30 before it is not counted.
    expect(fact).toEqual({
      kind: "away",
      direction: "best",
      pointsPerMatch: 2.4,
      beaten: 3,
      everySeason: false,
    });
  });

  it("finds a worst season as readily as a best one", () => {
    const stronger = [side(10, 6), side(10, 7), side(10, 8), side(10, 9)];

    expect(sideFact("home", side(5, 1), stronger)).toEqual({
      kind: "home",
      direction: "worst",
      pointsPerMatch: 0.6,
      beaten: 4,
      everySeason: true,
    });
  });

  it("stops the count at a season it equals as printed", () => {
    // 4 points in 6 matches against 67 in 100: both 0,67, so only the two seasons
    // before that one are beaten.
    const earlier = [side(10, 2), side(10, 1), side(100, 22, 1), side(10, 0)];

    expect(sideFact("home", side(6, 1, 1), earlier)).toBeNull();
    expect(sideFact("home", side(6, 1, 1), [side(10, 1), ...earlier])).toMatchObject({
      beaten: 3,
      pointsPerMatch: 0.67,
    });
  });

  it("stops the count at a season with no match on that side", () => {
    const earlier = [side(10, 5), side(10, 4), side(0, 0), side(10, 3)];

    expect(sideFact("home", side(5, 5), earlier)).toBeNull();
  });

  it("has no fact for a season in the middle of the earlier ones", () => {
    expect(sideFact("home", side(10, 4), weaker)).toBeNull();
  });
});

describe("runFacts", () => {
  const record = (length: number, to: string) => ({ length, from: "2023", to });

  it("states a record whose run ends in the season, not one ending earlier", () => {
    const records = { ...NO_RECORDS, wins: record(9, "2026"), defeats: record(4, "2025") };

    expect(runFacts(records, "2026", 3)).toEqual([{ kind: "run", run: "wins", length: 9 }]);
  });

  it("takes the winning run before the unbeaten one, and the losing before the winless", () => {
    const records: StreakRecords = {
      wins: record(9, "2026"),
      unbeaten: record(14, "2026"),
      defeats: record(6, "2026"),
      winless: record(11, "2026"),
    };

    expect(runFacts(records, "2026", 3)).toEqual([
      { kind: "run", run: "wins", length: 9 },
      { kind: "run", run: "defeats", length: 6 },
    ]);
  });

  it("falls back to the unbeaten run when the winning record is older", () => {
    const records = { ...NO_RECORDS, wins: record(9, "2024"), unbeaten: record(14, "2026") };

    expect(runFacts(records, "2026", 3)).toEqual([{ kind: "run", run: "unbeaten", length: 14 }]);
  });

  it("needs three earlier seasons in the competition, not two", () => {
    expect(runFacts({ ...NO_RECORDS, wins: record(9, "2026") }, "2026", 2)).toEqual([]);
  });

  // Four wins and a defeat in each season, so every season holds a four-win run.
  function fourWins(seasonId: number): RecordSeason {
    return {
      competitionCode: "VL",
      seasonId,
      label: String(seasonId),
      finished: [1, 2, 3, 4, 5].map((day) => ({
        providerMatchId: seasonId * 100 + day,
        kickoffAt: new Date(Date.UTC(seasonId, 4, day)),
        homeTeamProviderId: TEAM,
        awayTeamProviderId: OTHER,
        homeGoals: day === 5 ? 0 : 1,
        awayGoals: day === 5 ? 1 : 0,
      })),
    };
  }
  const fourWinRun = { kind: "run", run: "wins", length: 4 };

  it("states a run equal to an earlier spell's record, as Ennätykset gives it to the later", () => {
    // 2024 and 2025 missing, so 2023 and 2026 are two spells.
    const records = streakRecords([fourWins(2023), fourWins(2026)], TEAM);

    expect(runFacts(records, "2026", 3)).toContainEqual(fourWinRun);
  });

  it("does not state an equal run in the same spell, where Ennätykset names the first", () => {
    const records = streakRecords([fourWins(2025), fourWins(2026)], TEAM);

    expect(records.wins?.to).toBe("2025");
    expect(runFacts(records, "2026", 3)).not.toContainEqual(fourWinRun);
  });
});

describe("upsetFact", () => {
  it("states a win Elo gave 24 %, not one it gave 25 %", () => {
    expect(upsetFact(upset(0.24))).toEqual({ kind: "upset", match: upset(0.24) });
    expect(upsetFact(upset(0.25))).toBeNull();
  });

  it("rounds as the sentence prints, so a win printed 25 % is not under it", () => {
    expect(upsetFact(upset(0.2449))).not.toBeNull();
    expect(upsetFact(upset(0.2451))).toBeNull();
  });

  it("has no fact when the team won nothing Elo predicted", () => {
    expect(upsetFact(null)).toBeNull();
  });
});

describe("isFavourable", () => {
  it("counts a best side, a winning or unbeaten run and the upset as favourable", () => {
    expect(isFavourable(homeFact(3))).toBe(true);
    expect(isFavourable(homeFact(3, "worst"))).toBe(false);
    expect(isFavourable({ kind: "run", run: "wins", length: 9 })).toBe(true);
    expect(isFavourable({ kind: "run", run: "unbeaten", length: 9 })).toBe(true);
    expect(isFavourable({ kind: "run", run: "defeats", length: 9 })).toBe(false);
    expect(isFavourable({ kind: "run", run: "winless", length: 9 })).toBe(false);
    expect(isFavourable({ kind: "upset", match: upset(0.1) })).toBe(true);
  });
});

describe("rankFacts", () => {
  const kinds = (facts: SummaryFact[]) =>
    facts.map((fact) => `${fact.kind}${"direction" in fact ? `-${fact.direction}` : ""}`);

  it("puts favourable facts first", () => {
    const ranked = rankFacts([homeFact(5, "worst"), awayFact(3)], 5);

    expect(kinds(ranked)).toEqual(["away-best", "home-worst"]);
  });

  it("puts the fact beating more seasons first, a run as beating all of them", () => {
    const run: SummaryFact = { kind: "run", run: "wins", length: 9 };

    expect(kinds(rankFacts([homeFact(3), awayFact(4), run], 6))).toEqual([
      "run",
      "away-best",
      "home-best",
    ]);
  });

  it("orders equal counts the run, then home, then away, and the upset last", () => {
    const facts: SummaryFact[] = [
      { kind: "upset", match: upset(0.1) },
      awayFact(4),
      homeFact(4),
      { kind: "run", run: "unbeaten", length: 9 },
    ];

    expect(kinds(rankFacts(facts, 4))).toEqual(["run", "home-best", "away-best"]);
    expect(kinds(rankFacts(facts.slice(0, 3), 4))).toEqual(["home-best", "away-best", "upset"]);
  });

  it("keeps three unfavourable facts when there is no favourable one", () => {
    const facts: SummaryFact[] = [
      homeFact(3, "worst"),
      awayFact(3, "worst"),
      { kind: "run", run: "defeats", length: 6 },
    ];

    expect(rankFacts(facts, 3)).toHaveLength(3);
  });
});

// A season's finished matches for `TEAM`: each character a result at home, then away.
function finished(seasonId: number, home: string, away: string): ResultMatch[] {
  const score = { V: [1, 0], T: [0, 0], H: [0, 1] } as const;
  const results = [
    ...[...home].map((result) => ({ result, atHome: true })),
    ...[...away].map((result) => ({ result, atHome: false })),
  ];
  return results.map(({ result, atHome }, index) => {
    const [own, other] = score[result as keyof typeof score];
    return {
      providerMatchId: seasonId * 100 + index,
      kickoffAt: new Date(Date.UTC(seasonId, 3, index + 1)),
      homeTeamProviderId: atHome ? TEAM : OTHER,
      awayTeamProviderId: atHome ? OTHER : TEAM,
      homeGoals: atHome ? own : other,
      awayGoals: atHome ? other : own,
    };
  });
}

function read(matches: ResultMatch[]): SeasonReadResult {
  const season: SeasonRead = {
    competition: "Veikkausliiga",
    finished: matches.map((match) => ({ ...match, matchday: null })),
    all: [],
    points: [],
    teamCount: 0,
  };
  return { status: "ok", read: season };
}

const SEASONS = [2022, 2023, 2024, 2025, 2026].map((seasonId) => ({
  competitionCode: "VL",
  seasonId,
  matches: 10,
}));

// 2026 at its best at home and middling away; every earlier season weaker at home.
const STORED: Record<string, SeasonReadResult> = {
  "VL-2026": read(finished(2026, "VVVVV", "VTHVT")),
  "VL-2025": read(finished(2025, "VVTHH", "VTHVT")),
  "VL-2024": read(finished(2024, "VTTHH", "VTHVT")),
  "VL-2023": read(finished(2023, "THHHH", "VTHVT")),
  "VL-2022": read(finished(2022, "HHHHH", "VTHVT")),
};

function stored(key: SeasonKey): SeasonReadResult {
  return STORED[`${key.competitionCode}-${key.seasonId}`] ?? { status: "empty" };
}

function readers(overrides: Partial<SummaryReaders<(typeof SEASONS)[number]>> = {}) {
  return {
    teamId: TEAM,
    selected: { competitionCode: "VL", seasonId: 2026 },
    activeSeasonId: 2026,
    seasons: SEASONS,
    isLeague: (code: string) => code !== "SC",
    label: String,
    read: vi.fn(async (key: SeasonKey) => stored(key)),
    records: vi.fn(
      async (): Promise<StreakRecordsSeries> => ({
        status: "ok",
        records: NO_RECORDS,
        scope: "Veikkausliiga",
      })
    ),
    upset: vi.fn(async (): Promise<Surprise | null> => null),
    ...overrides,
  };
}

describe("seasonSummaryFor", () => {
  it("states the season's facts, under its label, in progress when it is the active one", async () => {
    const summary = await seasonSummaryFor(readers());

    expect(summary).toEqual({
      status: "ok",
      facts: [
        {
          kind: "home",
          direction: "best",
          pointsPerMatch: 3,
          beaten: 4,
          everySeason: true,
        },
      ],
      inProgress: true,
      seasonLabel: "2026",
    });
  });

  it("is not in progress once the active season has moved on", async () => {
    expect(await seasonSummaryFor(readers({ activeSeasonId: 2027 }))).toMatchObject({
      inProgress: false,
    });
  });

  it("compares only earlier seasons of the same competition, newest first", async () => {
    const seasons = [...SEASONS, { competitionCode: "YK", seasonId: 2021, matches: 10 }];
    const summary = readers({ seasons });

    await seasonSummaryFor(summary);

    expect(vi.mocked(summary.read).mock.calls.map(([key]) => key.seasonId)).toEqual([
      2026, 2025, 2024, 2023, 2022,
    ]);
  });

  it("leaves out an earlier season with nothing stored", async () => {
    const summary = await seasonSummaryFor(
      readers({
        read: async (key) => (key.seasonId === 2025 ? { status: "empty" } : stored(key)),
      })
    );

    expect(summary).toMatchObject({ facts: [{ kind: "home", beaten: 3, everySeason: true }] });
  });

  it("adds the run record and the upset, ranked", async () => {
    const summary = await seasonSummaryFor(
      readers({
        records: async () => ({
          status: "ok",
          records: { ...NO_RECORDS, wins: { length: 7, from: "2026", to: "2026" } },
          scope: "Veikkausliiga",
        }),
        upset: async () => upset(0.16),
      })
    );

    expect(summary).toMatchObject({
      facts: [{ kind: "run", run: "wins" }, { kind: "home" }, { kind: "upset" }],
    });
  });

  it("has no block for a past season, and reads neither the records nor the upset", async () => {
    const summary = readers({ selected: { competitionCode: "VL", seasonId: 2025 } });

    expect(await seasonSummaryFor(summary)).toEqual({ status: "unavailable" });
    expect(summary.records).not.toHaveBeenCalled();
    expect(summary.upset).not.toHaveBeenCalled();
  });

  it("keeps the block while the next season's fixtures are stored but none is played", async () => {
    const seasons = [...SEASONS, { competitionCode: "VL", seasonId: 2027, matches: 22 }];
    const summary = readers({
      seasons,
      read: async (key) => (key.seasonId === 2027 ? read([]) : stored(key)),
    });

    expect(await seasonSummaryFor(summary)).toMatchObject({ status: "ok", seasonLabel: "2026" });
  });

  it.each([
    ["at home", "V", ""],
    ["away", "", "V"],
  ])(
    "has no block once the club has played %s in a later season, in any division",
    async (_side, home, away) => {
      const seasons = [...SEASONS, { competitionCode: "YK", seasonId: 2027, matches: 1 }];
      const summary = readers({
        seasons,
        read: async (key) =>
          key.seasonId === 2027 ? read(finished(2027, home, away)) : stored(key),
      });

      expect(await seasonSummaryFor(summary)).toEqual({ status: "unavailable" });
    }
  );

  it("does not count another team's match as the club's in a later season", async () => {
    const seasons = [...SEASONS, { competitionCode: "VL", seasonId: 2027, matches: 22 }];
    const others: ResultMatch = {
      providerMatchId: 1,
      kickoffAt: new Date(Date.UTC(2027, 3, 1)),
      homeTeamProviderId: OTHER,
      awayTeamProviderId: 3,
      homeGoals: 1,
      awayGoals: 0,
    };
    const summary = readers({
      seasons,
      read: async (key) => (key.seasonId === 2027 ? read([others]) : stored(key)),
    });

    expect(await seasonSummaryFor(summary)).toMatchObject({ status: "ok" });
  });

  it("fails when a later season's read fails", async () => {
    const seasons = [...SEASONS, { competitionCode: "VL", seasonId: 2027, matches: 22 }];
    const summary = readers({
      seasons,
      read: async (key) => (key.seasonId === 2027 ? { status: "error" } : stored(key)),
    });

    expect(await seasonSummaryFor(summary)).toEqual({ status: "error" });
  });

  it("has no block for a cup season", async () => {
    const seasons = [...SEASONS, { competitionCode: "SC", seasonId: 2026, matches: 3 }];
    const summary = readers({ seasons, selected: { competitionCode: "SC", seasonId: 2026 } });

    expect(await seasonSummaryFor(summary)).toEqual({ status: "unavailable" });
    expect(summary.read).not.toHaveBeenCalled();
  });

  it("fails when the club's seasons could not be looked up, and reads nothing", async () => {
    const summary = readers({ seasons: null });

    expect(await seasonSummaryFor(summary)).toEqual({ status: "error" });
    expect(summary.read).not.toHaveBeenCalled();
  });

  it("has no block for a cup season even when the seasons could not be looked up", async () => {
    const summary = readers({ seasons: null, selected: { competitionCode: "SC", seasonId: 2026 } });

    expect(await seasonSummaryFor(summary)).toEqual({ status: "unavailable" });
  });

  it("passes the club's seasons to the records", async () => {
    const summary = readers();

    await seasonSummaryFor(summary);

    expect(summary.records).toHaveBeenCalledWith(SEASONS);
  });

  it("has no block for a past season when one later season was played, though another failed", async () => {
    const seasons = [...SEASONS, { competitionCode: "VL", seasonId: 2027, matches: 22 }];
    const summary = readers({
      seasons,
      selected: { competitionCode: "VL", seasonId: 2025 },
      read: async (key) => (key.seasonId === 2027 ? { status: "error" } : stored(key)),
    });

    expect(await seasonSummaryFor(summary)).toEqual({ status: "unavailable" });
  });

  it("has no block for a past season when a later one was played, though its own read failed", async () => {
    const summary = readers({
      selected: { competitionCode: "VL", seasonId: 2025 },
      read: async (key) => (key.seasonId === 2025 ? { status: "error" } : stored(key)),
    });

    expect(await seasonSummaryFor(summary)).toEqual({ status: "unavailable" });
  });

  it("has no block before five matches are played, and reads no other season", async () => {
    const summary = readers({
      read: vi.fn(async () => read(finished(2026, "VVV", "V"))),
    });

    expect(await seasonSummaryFor(summary)).toEqual({ status: "unavailable" });
    expect(summary.read).toHaveBeenCalledTimes(1);
    expect(summary.records).not.toHaveBeenCalled();
    expect(summary.upset).not.toHaveBeenCalled();
  });

  it("has a block at five matches played", async () => {
    const summary = await seasonSummaryFor(
      readers({
        read: async () => read(finished(2026, "VVV", "VV")),
        upset: async () => upset(0.1),
      })
    );

    expect(summary).toMatchObject({ status: "ok", facts: [{ kind: "upset" }] });
  });

  it("has no block when no fact holds", async () => {
    const summary = readers({
      read: async (key) =>
        key.seasonId === 2026
          ? read(finished(2026, "VVTHH", "VTHVT"))
          : stored({ ...key, seasonId: 2025 }),
    });

    expect(await seasonSummaryFor(summary)).toEqual({ status: "unavailable" });
  });

  it("has no block when the selected season has nothing stored", async () => {
    const summary = readers({ read: async () => ({ status: "empty" }) });

    expect(await seasonSummaryFor(summary)).toEqual({ status: "unavailable" });
  });

  it("fails when the selected season's read fails", async () => {
    const summary = readers({ read: async () => ({ status: "error" }) });

    expect(await seasonSummaryFor(summary)).toEqual({ status: "error" });
  });

  it("fails when an earlier season's read fails", async () => {
    const summary = readers({
      read: async (key) => (key.seasonId === 2024 ? { status: "error" } : stored(key)),
    });

    expect(await seasonSummaryFor(summary)).toEqual({ status: "error" });
  });

  it("fails when the records fail", async () => {
    const summary = readers({ records: async () => ({ status: "error" }) });

    expect(await seasonSummaryFor(summary)).toEqual({ status: "error" });
  });

  it("has no run fact when the club has no records, and keeps the others", async () => {
    const summary = readers({ records: async () => ({ status: "unavailable" }) });

    expect(await seasonSummaryFor(summary)).toMatchObject({ facts: [{ kind: "home" }] });
  });
});
