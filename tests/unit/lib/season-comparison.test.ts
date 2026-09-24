import { describe, expect, it } from "vitest";
import type { ResultMatch } from "@/lib/form-series";
import {
  type ComparisonRow,
  compareSeasons,
  comparisonFor,
  comparisonRows,
  MEASURES,
  type Measure,
  otherLeagueSeasons,
  positionAtShare,
  readSeasons,
  type SeasonSummary,
  seasonLength,
  shareCompleted,
  shareOf,
  summariseSeason,
} from "@/lib/season-comparison";

const TEAM = 1;
const OTHER = 2;

/** One finished match for `TEAM`, at home, with the score it is given. */
function match(id: number, scored: number, conceded: number): ResultMatch {
  return {
    providerMatchId: id,
    kickoffAt: new Date(2026, 0, id),
    homeTeamProviderId: TEAM,
    awayTeamProviderId: OTHER,
    homeGoals: scored,
    awayGoals: conceded,
  };
}

/** A season of `results`, each a `[scored, conceded]` pair. */
function season(
  results: ReadonlyArray<readonly [number, number]>,
  position: { place: number; teamCount: number } | null = null
): SeasonSummary {
  return summariseSeason(
    results.map(([scored, conceded], index) => match(index + 1, scored, conceded)),
    TEAM,
    position
  );
}

function valueFor(rows: ComparisonRow[], measure: Measure) {
  const row = rows.find((candidate) => candidate.measure === measure);
  if (row === undefined) throw new Error(`No row for ${measure}`);
  return row;
}

describe("summariseSeason", () => {
  it("counts home and away together, which is the standings row", () => {
    const away: ResultMatch = {
      providerMatchId: 99,
      kickoffAt: new Date(2026, 5, 1),
      homeTeamProviderId: OTHER,
      awayTeamProviderId: TEAM,
      homeGoals: 0,
      awayGoals: 2,
    };
    const summary = summariseSeason([match(1, 3, 1), away], TEAM, null);

    expect(summary.stats).toEqual({
      matches: 2,
      won: 2,
      drawn: 0,
      lost: 0,
      scored: 5,
      conceded: 1,
    });
  });

  it("counts a clean sheet from the team's own side of the fixture", () => {
    expect(season([[1, 0] as const, [0, 0] as const, [2, 1] as const]).cleanSheets).toBe(2);
  });

  it("has no clean sheets, rather than undefined, for a season with no match", () => {
    expect(season([]).cleanSheets).toBe(0);
  });
});

describe("shareOf", () => {
  it("is the place over the table, so smaller is better", () => {
    expect(shareOf({ place: 3, teamCount: 12 })).toBe(0.25);
  });

  it("tells 1st of 10 from 10th of 12, which a raw place cannot", () => {
    expect(shareOf({ place: 1, teamCount: 10 })).toBeLessThan(
      shareOf({ place: 10, teamCount: 12 }) ?? 0
    );
  });

  it("is null for a season that ranked nothing", () => {
    expect(shareOf(null)).toBeNull();
    expect(shareOf({ place: 1, teamCount: 0 })).toBeNull();
  });
});

describe("comparisonRows", () => {
  it("returns every measure, in the panel's order", () => {
    const rows = comparisonRows(season([[1, 0] as const]), []);

    expect(rows.map((row) => row.measure)).toEqual([...MEASURES]);
  });

  it("excludes the selected season from its own baseline", () => {
    // The selected season is a 3-0 win; the only other season is a 0-3 loss.
    // A baseline containing the selected season could not be 0 points.
    const rows = comparisonRows(season([[3, 0] as const]), [season([[0, 3] as const])]);

    expect(valueFor(rows, "points").selected).toBe(3);
    expect(valueFor(rows, "points").baseline).toBe(0);
  });

  it("pools the other seasons' matches rather than averaging their averages", () => {
    // One win in a one-match season, none in a nine-match season. Pooled, that
    // is 3 points from 10 matches. Averaging the two seasons' own rates would
    // give 1,5 — five times as much — and let a one-match season count as
    // heavily as a full one.
    const rows = comparisonRows(season([[1, 0] as const]), [
      season([[1, 0] as const]),
      season(Array.from({ length: 9 }, () => [0, 1] as const)),
    ]);

    expect(valueFor(rows, "points").baseline).toBeCloseTo(0.3, 10);
  });

  it("averages positions rather than pooling them", () => {
    // 1st of 10 is 0,1 and 6th of 12 is 0,5; their mean is 0,3.
    const rows = comparisonRows(season([[1, 0] as const], { place: 3, teamCount: 12 }), [
      season([[1, 0] as const], { place: 1, teamCount: 10 }),
      season([[1, 0] as const], { place: 6, teamCount: 12 }),
    ]);

    expect(valueFor(rows, "position").selected).toBe(0.25);
    expect(valueFor(rows, "position").baseline).toBeCloseTo(0.3, 10);
  });

  it("keeps a season that ranked nothing in the rates but out of the position mean", () => {
    // The unranked season's matches still count towards the pooled rate, while
    // the position mean is the one ranked season's own share.
    const rows = comparisonRows(season([[1, 0] as const], { place: 1, teamCount: 10 }), [
      season([[4, 0] as const], { place: 2, teamCount: 10 }),
      season([[0, 0] as const], null),
    ]);

    expect(valueFor(rows, "position").baseline).toBe(0.2);
    expect(valueFor(rows, "scored").baseline).toBe(2);
  });

  it("has no baseline at all for a club with no other season", () => {
    const rows = comparisonRows(season([[2, 1] as const], { place: 4, teamCount: 8 }), []);

    expect(rows.every((row) => row.baseline === null)).toBe(true);
    expect(rows.every((row) => row.selected !== null)).toBe(true);
  });

  it("reports no value, rather than zero, for a season with no match", () => {
    const rows = comparisonRows(season([]), [season([])]);

    expect(rows.every((row) => row.selected === null)).toBe(true);
    expect(rows.every((row) => row.baseline === null)).toBe(true);
  });

  it("computes the clean-sheet share over the pooled matches", () => {
    // Two clean sheets in four pooled matches.
    const rows = comparisonRows(season([[1, 1] as const]), [
      season([[1, 0] as const, [0, 0] as const]),
      season([[1, 2] as const, [0, 1] as const]),
    ]);

    expect(valueFor(rows, "cleanSheets").baseline).toBe(50);
    expect(valueFor(rows, "cleanSheets").selected).toBe(0);
  });

  it("computes the win percentage over the pooled matches", () => {
    const rows = comparisonRows(season([[1, 0] as const]), [
      season([[1, 0] as const, [0, 1] as const]),
      season([[0, 1] as const, [0, 1] as const]),
    ]);

    expect(valueFor(rows, "winPercentage").baseline).toBe(25);
    expect(valueFor(rows, "winPercentage").selected).toBe(100);
  });

  it("counts goals conceded per match over the pool, not per season", () => {
    const rows = comparisonRows(season([[0, 0] as const]), [
      season([[0, 4] as const]),
      season(Array.from({ length: 3 }, () => [0, 0] as const)),
    ]);

    expect(valueFor(rows, "conceded").baseline).toBe(1);
  });
});

describe("seasonLength", () => {
  it("is the last scheduled round, not the last one played", () => {
    // Rounds 5 and 27 are scheduled; only 5 has been played.
    expect(seasonLength([{ matchday: 5 }, { matchday: 27 }, { matchday: 12 }])).toBe(27);
  });

  it("ignores a match with no round, as spec 003 has it", () => {
    expect(seasonLength([{ matchday: null }, { matchday: 3 }])).toBe(3);
  });

  it("is null for a season with no round at all", () => {
    expect(seasonLength([{ matchday: null }])).toBeNull();
    expect(seasonLength([])).toBeNull();
  });
});

describe("shareCompleted", () => {
  it("is rounds played over rounds scheduled", () => {
    expect(shareCompleted(10, 27)).toBeCloseTo(0.37, 2);
  });

  it("is 1 for a finished season, so its comparison is against final positions", () => {
    expect(shareCompleted(27, 27)).toBe(1);
  });

  it("never exceeds 1, however TASO numbers its rounds", () => {
    // A round number can outrun the scheduled count (#413).
    expect(shareCompleted(31, 27)).toBe(1);
  });

  it("is null when either side is unknown", () => {
    expect(shareCompleted(null, 27)).toBeNull();
    expect(shareCompleted(10, null)).toBeNull();
    expect(shareCompleted(10, 0)).toBeNull();
  });
});

describe("positionAtShare", () => {
  const points = [
    { round: 1, position: 8, played: true },
    { round: 2, position: 5, played: true },
    { round: 3, position: 4, played: true },
    { round: 4, position: 2, played: true },
  ];

  it("reads the season at the matching share, not at the same matchday", () => {
    // Half of a 4-round season is round 2; half of a 22-round season is 11.
    expect(positionAtShare(points, 4, 0.5)).toBe(5);
  });

  it("gives the final position at the end of the season", () => {
    expect(positionAtShare(points, 4, 1)).toBe(2);
  });

  it("takes the last position at or before the round, not the one after", () => {
    // 0,6 of 4 rounds rounds to 2; round 3 has not happened at that point.
    expect(positionAtShare(points, 4, 0.6)).toBe(5);
  });

  it("never asks for a round before the first", () => {
    expect(positionAtShare(points, 4, 0)).toBe(8);
  });

  it("is null when the club had no position by then", () => {
    expect(positionAtShare([{ round: 9, position: 3, played: true }], 20, 0.1)).toBeNull();
  });
});

describe("compareSeasons", () => {
  /** A season where the club played `results` in consecutive rounds. */
  function read(
    competition: string,
    results: ReadonlyArray<readonly [number, number]>,
    options: { scheduled?: number; positions?: number[]; teamCount?: number } = {}
  ) {
    const finished = results.map(([scored, conceded], index) => ({
      ...match(index + 1, scored, conceded),
      matchday: index + 1,
    }));
    const scheduled = options.scheduled ?? results.length;

    return {
      competition,
      finished,
      all: Array.from({ length: scheduled }, (_, index) => ({ matchday: index + 1 })),
      points: (options.positions ?? results.map(() => 1)).map((position, index) => ({
        round: index + 1,
        position,
        played: true,
      })),
      teamCount: options.teamCount ?? 10,
    };
  }

  it("names each competition once, in the order met", () => {
    const comparison = compareSeasons(TEAM, read("Veikkausliiga", [[1, 0] as const]), [
      read("Ykkönen", [[1, 0] as const]),
      read("Veikkausliiga", [[1, 0] as const]),
      read("Ykkönen", [[1, 0] as const]),
    ]);

    expect(comparison.competitions).toEqual(["Ykkönen", "Veikkausliiga"]);
    expect(comparison.seasons).toBe(3);
  });

  it("reads every other season at the selected season's share, not at its end", () => {
    // The selected season is 2 rounds into a 10-round season: a fifth. The
    // other season ran 10 rounds and the club slid from 1st to 9th, so a fifth
    // of the way through it stood 2nd — not the 9th it finished.
    const comparison = compareSeasons(
      TEAM,
      read("Veikkausliiga", [[1, 0] as const, [1, 0] as const], { scheduled: 10 }),
      [
        read(
          "Veikkausliiga",
          Array.from({ length: 10 }, () => [1, 0] as const),
          {
            positions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 9],
            teamCount: 10,
          }
        ),
      ]
    );

    expect(valueFor(comparison.rows, "position").baseline).toBe(0.2);
  });

  it("compares a finished season against the other seasons' final positions", () => {
    const comparison = compareSeasons(
      TEAM,
      read(
        "Veikkausliiga",
        Array.from({ length: 10 }, () => [1, 0] as const),
        {
          positions: Array.from({ length: 10 }, () => 3),
        }
      ),
      [
        read(
          "Veikkausliiga",
          Array.from({ length: 10 }, () => [1, 0] as const),
          {
            positions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 9],
            teamCount: 10,
          }
        ),
      ]
    );

    expect(valueFor(comparison.rows, "position").baseline).toBe(0.9);
  });

  it("keeps a shorter season in the position row, since the share is not a matchday", () => {
    // The selected season is 20 rounds into 27. A 22-round season is shorter
    // than 20 rounds played, yet still has a point at 20/27 of its own length.
    const comparison = compareSeasons(
      TEAM,
      read(
        "Veikkausliiga",
        Array.from({ length: 20 }, () => [1, 0] as const),
        { scheduled: 27 }
      ),
      [
        read(
          "Ykkönen",
          Array.from({ length: 22 }, () => [1, 0] as const),
          {
            positions: Array.from({ length: 22 }, (_, index) => (index < 16 ? 4 : 7)),
            teamCount: 12,
          }
        ),
      ]
    );

    // 20/27 of 22 rounds is round 16, where the club stood 4th of 12.
    expect(valueFor(comparison.rows, "position").baseline).toBeCloseTo(4 / 12, 10);
  });

  it("ranks nothing from a season whose matches carry no round", () => {
    // A season with no matchday has no length, so it can supply no position —
    // but its matches still count towards the pooled rates (S10).
    const roundless = {
      ...read("Suomen Cup", [[3, 0] as const]),
      all: [{ matchday: null }],
    };
    const comparison = compareSeasons(TEAM, read("Veikkausliiga", [[1, 0] as const]), [roundless]);

    expect(valueFor(comparison.rows, "position").baseline).toBeNull();
    expect(valueFor(comparison.rows, "scored").baseline).toBe(3);
  });

  it("ranks nothing from a season the club entered after the matching round", () => {
    // The selected season is a tenth of the way through; this one has no point
    // until its own round 9, which is far past that share of its length.
    const late = read("Veikkausliiga", [[1, 0] as const], { scheduled: 20 });
    const comparison = compareSeasons(
      TEAM,
      read("Veikkausliiga", [[1, 0] as const], { scheduled: 10 }),
      [{ ...late, points: [{ round: 9, position: 3, played: true }] }]
    );

    expect(valueFor(comparison.rows, "position").baseline).toBeNull();
  });

  it("treats a selected season with no round as complete, rather than as nothing", () => {
    // No round means no share to match, so the other seasons are read at their
    // end — the same behaviour as a finished season.
    const selected = {
      ...read("Suomen Cup", [[1, 0] as const]),
      all: [{ matchday: null }],
    };
    const comparison = compareSeasons(TEAM, selected, [
      read("Veikkausliiga", [[1, 0] as const, [1, 0] as const], { positions: [1, 7] }),
    ]);

    expect(valueFor(comparison.rows, "position").baseline).toBe(0.7);
  });

  it("has no baseline and no competitions for a club with no other season", () => {
    const comparison = compareSeasons(TEAM, read("Veikkausliiga", [[1, 0] as const]), []);

    expect(comparison.seasons).toBe(0);
    expect(comparison.competitions).toEqual([]);
    expect(comparison.rows.every((row) => row.baseline === null)).toBe(true);
  });
});

describe("otherLeagueSeasons", () => {
  const leagues = new Set(["VL", "M1"]);
  const isLeague = (code: string) => leagues.has(code);

  const seasons = [
    { competitionCode: "VL", seasonId: 2026 },
    { competitionCode: "MSC", seasonId: 2026 },
    { competitionCode: "M1", seasonId: 2025 },
    { competitionCode: "VL", seasonId: 2024 },
  ];

  it("drops the selected season, which must not be its own baseline", () => {
    const others = otherLeagueSeasons(seasons, { competitionCode: "VL", seasonId: 2026 }, isLeague);

    expect(others).not.toContainEqual({ competitionCode: "VL", seasonId: 2026 });
  });

  it("drops cups, which have no table and distort a per-match average", () => {
    const others = otherLeagueSeasons(seasons, { competitionCode: "VL", seasonId: 2026 }, isLeague);

    expect(others.map((season) => season.competitionCode)).toEqual(["M1", "VL"]);
  });

  it("keeps the same year in another competition, which is a different season", () => {
    // The cup run of 2026 is dropped for being a cup, not for being 2026: the
    // club's 2026 Ykkönen season would count.
    const others = otherLeagueSeasons(
      [...seasons, { competitionCode: "M1", seasonId: 2026 }],
      { competitionCode: "VL", seasonId: 2026 },
      isLeague
    );

    expect(others).toContainEqual({ competitionCode: "M1", seasonId: 2026 });
  });

  it("keeps the same competition in another year", () => {
    const others = otherLeagueSeasons(seasons, { competitionCode: "VL", seasonId: 2026 }, isLeague);

    expect(others).toContainEqual({ competitionCode: "VL", seasonId: 2024 });
  });
});

describe("readSeasons", () => {
  const read = {
    competition: "Veikkausliiga",
    finished: [],
    all: [],
    points: [],
    teamCount: 0,
  };

  it("keeps the seasons that read, and drops the ones with nothing stored", () => {
    const result = readSeasons([
      { status: "ok", read },
      { status: "empty" },
      { status: "ok", read },
    ]);

    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.reads).toHaveLength(2);
  });

  it("fails the whole comparison when any season failed to read", () => {
    // A baseline quietly computed over the seasons that happened to read is a
    // plausible wrong answer, and the panel's own "Verrattuna {n} muuhun
    // kauteen" line would state the wrong n.
    const result = readSeasons([{ status: "ok", read }, { status: "error" }]);

    expect(result).toEqual({ status: "error" });
  });

  it("has no baseline, and no error, when every season is empty", () => {
    const result = readSeasons([{ status: "empty" }, { status: "empty" }]);

    expect(result).toEqual({ status: "ok", reads: [] });
  });
});

describe("comparisonFor", () => {
  const isLeague = (code: string) => code !== "CUP";
  const selectedKey = { competitionCode: "PL", seasonId: 2024 };

  /** A season that reads, with one finished match the club won. */
  function okRead(competition = "Valioliiga") {
    return {
      status: "ok" as const,
      read: {
        competition,
        finished: [{ ...match(1, 3, 0), matchday: 1 }],
        all: [{ matchday: 1 }],
        points: [{ round: 1, position: 1, played: true }],
        teamCount: 20,
      },
    };
  }

  it("compares the selected season with the other league seasons", async () => {
    const result = await comparisonFor(
      TEAM,
      selectedKey,
      [
        selectedKey,
        { competitionCode: "PL", seasonId: 2023 },
        { competitionCode: "CUP", seasonId: 2023 },
      ],
      isLeague,
      async () => okRead()
    );

    expect(result.status).toBe("ok");
    // The cup and the selected season are both left out.
    expect(result.status === "ok" && result.seasons).toBe(1);
  });

  it("has no panel when the selected season is empty", async () => {
    const result = await comparisonFor(TEAM, selectedKey, [selectedKey], isLeague, async () => ({
      status: "empty",
    }));

    expect(result).toEqual({ status: "unavailable" });
  });

  it("reports an error when the selected season failed to read", async () => {
    const result = await comparisonFor(TEAM, selectedKey, [selectedKey], isLeague, async () => ({
      status: "error",
    }));

    expect(result).toEqual({ status: "error" });
  });

  it("reports an error when a baseline season failed, rather than comparing fewer", async () => {
    let call = 0;
    const result = await comparisonFor(
      TEAM,
      selectedKey,
      [selectedKey, { competitionCode: "PL", seasonId: 2023 }],
      isLeague,
      async () => (call++ === 0 ? okRead() : { status: "error" as const })
    );

    expect(result).toEqual({ status: "error" });
  });

  it("leaves out a baseline season that is merely empty", async () => {
    let call = 0;
    const result = await comparisonFor(
      TEAM,
      selectedKey,
      [selectedKey, { competitionCode: "PL", seasonId: 2023 }],
      isLeague,
      async () => (call++ === 0 ? okRead() : { status: "empty" as const })
    );

    expect(result.status === "ok" && result.seasons).toBe(0);
  });
});
