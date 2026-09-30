import { describe, expect, it } from "vitest";
import { calculateStandings, type NormalizedMatch } from "@/lib/standings";
import {
  hasTableVolatility,
  midSeasonRound,
  movementBetween,
  singleTableMovement,
  volatilitySeries,
} from "@/lib/table-volatility";

describe("hasTableVolatility (S10)", () => {
  it.each([
    ["football-data", "PL"],
    ["football-data", "BSA"],
    ["taso", "VL"],
    ["taso", "M2"],
  ] as const)("shows the panel on %s %s", (kind, code) => {
    expect(hasTableVolatility(kind, code)).toBe(true);
  });

  it.each([
    // Most of its teams have no final position.
    ["football-data", "CL"],
    ["football-data", "WC"],
    ["taso", "LC"],
    ["taso", "PL"],
  ] as const)("leaves it off %s %s", (kind, code) => {
    expect(hasTableVolatility(kind, code)).toBe(false);
  });
});

describe("midSeasonRound (S7)", () => {
  it("is halfway for an even count, and rounds up for an odd one", () => {
    expect(midSeasonRound(38)).toBe(19);
    // Veikkausliiga: 22 regular rounds and 5 after the split.
    expect(midSeasonRound(27)).toBe(14);
    expect(midSeasonRound(1)).toBe(1);
  });
});

describe("movementBetween (S6, S12)", () => {
  const row = (teamProviderId: number, position: number) => ({ teamProviderId, position });

  it("sums every team's places moved, either way", () => {
    expect(
      movementBetween(
        [row(1, 1), row(2, 2), row(3, 3), row(4, 4)],
        [row(1, 3), row(2, 1), row(3, 2), row(4, 4)]
      )
    ).toEqual({ total: 4, teams: 4 });
  });

  it("counts only the teams in both tables", () => {
    expect(movementBetween([row(1, 1), row(2, 2)], [row(1, 2), row(3, 1)])).toEqual({
      total: 1,
      teams: 1,
    });
  });
});

describe("singleTableMovement", () => {
  /** Four teams, two rounds each way: rounds 1–2 then 3–4. */
  function game(matchday: number | null, home: number, away: number, score: [number, number]) {
    return {
      providerMatchId: (matchday ?? 0) * 100 + home * 10 + away,
      competitionCode: "PL",
      seasonId: 2024,
      kickoffAt: new Date("2024-09-01T15:00:00Z"),
      matchday,
      homeTeamProviderId: home,
      homeTeamName: `Team ${home}`,
      awayTeamProviderId: away,
      awayTeamName: `Team ${away}`,
      homeGoals: score[0],
      awayGoals: score[1],
    } satisfies NormalizedMatch;
  }

  const season = [
    game(1, 1, 2, [1, 0]),
    game(1, 3, 4, [1, 0]),
    game(2, 1, 3, [1, 0]),
    game(2, 2, 4, [1, 0]),
    // The second half turns it round.
    game(3, 4, 1, [3, 0]),
    game(3, 2, 3, [0, 2]),
    game(4, 4, 2, [3, 0]),
    game(4, 3, 1, [2, 0]),
  ];

  it("sets the table after round ⌈R / 2⌉ against the final one, both the standings page's", () => {
    const mid = calculateStandings(
      season.filter((match) => (match.matchday ?? 0) <= 2),
      season
    );
    const final = calculateStandings(season, season);

    expect(singleTableMovement(season, season)).toEqual(movementBetween(mid, final));
    // Team 1 led at halfway and finished third; team 4, last at halfway, second.
    expect(singleTableMovement(season, season)?.total).toBeGreaterThan(0);
  });

  it("counts a match with no round in the final table only (specs/003)", () => {
    // Team 4's big win would lift it off the bottom at halfway if it counted there.
    const unnumbered = [...season, game(null, 4, 2, [5, 0])];
    const final = calculateStandings(unnumbered, unnumbered);
    const mid = calculateStandings(
      season.filter((match) => (match.matchday ?? 0) <= 2),
      unnumbered
    );

    expect(singleTableMovement(unnumbered, unnumbered)).toEqual(movementBetween(mid, final));
  });

  it("has no figure for a season without a numbered round (S9)", () => {
    const rounds = season.map((match) => ({ ...match, matchday: null }));

    expect(singleTableMovement(rounds, rounds)).toBeNull();
  });
});

describe("volatilitySeries", () => {
  it("draws each season with a figure, oldest first, from 0 to the next whole place", () => {
    expect(
      volatilitySeries([
        { seasonId: 2025, movement: { total: 44, teams: 20 } },
        { seasonId: 2024, movement: { total: 30, teams: 20 } },
      ])
    ).toEqual({
      status: "ok",
      points: [
        { seasonId: 2024, change: 1.5, teams: 20 },
        { seasonId: 2025, change: 2.2, teams: 20 },
      ],
      yDomain: [0, 3],
      yTicks: [0, 1, 2, 3],
      leftOut: 0,
    });
  });

  it("counts a season without per-round tables, or with no team in both, as left out (S9)", () => {
    const series = volatilitySeries([
      { seasonId: 2023, movement: null },
      { seasonId: 2024, movement: { total: 6, teams: 12 } },
      { seasonId: 2025, movement: { total: 0, teams: 0 } },
      { seasonId: 2026, movement: { total: 6, teams: 12 } },
    ]);

    expect(series).toMatchObject({ status: "ok", leftOut: 2 });
  });

  it("keeps an axis of at least one place when nothing moved", () => {
    expect(
      volatilitySeries([
        { seasonId: 2024, movement: { total: 0, teams: 12 } },
        { seasonId: 2025, movement: { total: 0, teams: 12 } },
      ])
    ).toMatchObject({ yDomain: [0, 1], yTicks: [0, 1] });
  });

  it.each([
    ["no season", []],
    ["one season", [{ seasonId: 2024, movement: { total: 6, teams: 12 } }]],
    [
      "one season beside one without tables",
      [
        { seasonId: 2024, movement: { total: 6, teams: 12 } },
        { seasonId: 2025, movement: null },
      ],
    ],
  ])("is too few to draw with %s (S11)", (_name, seasons) => {
    expect(volatilitySeries(seasons)).toEqual({ status: "too-few" });
  });
});
