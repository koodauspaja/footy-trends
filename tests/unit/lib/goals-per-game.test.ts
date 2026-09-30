import { describe, expect, it } from "vitest";
import { goalsPerGameSeries, halfStepAxis, hasGoalsPerGame } from "@/lib/goals-per-game";

describe("hasGoalsPerGame (S5)", () => {
  it.each([
    ["football-data", "PL"],
    ["football-data", "BSA"],
    ["football-data", "CL"],
    ["taso", "VL"],
    ["taso", "N1"],
    ["taso", "T18SM"],
  ] as const)("shows the section on %s %s", (kind, code) => {
    expect(hasGoalsPerGame(kind, code)).toBe(true);
  });

  it.each([
    ["football-data", "WC"],
    ["football-data", "EC"],
    ["taso", "MSC"],
    ["taso", "LC"],
    // A code is only read against its own provider.
    ["taso", "PL"],
    ["football-data", "VL"],
  ] as const)("leaves it off %s %s", (kind, code) => {
    expect(hasGoalsPerGame(kind, code)).toBe(false);
  });
});

describe("halfStepAxis (S13)", () => {
  it("zooms to the nearest 0,5 either side of the data", () => {
    // Veikkausliiga's production range, the widest of the three measured.
    expect(halfStepAxis([2.26, 3.29])).toEqual({ domain: [2, 3.5], ticks: [2, 2.5, 3, 3.5] });
  });

  it("keeps a value that sits on a step as that step's end, not the next one", () => {
    expect(halfStepAxis([2.5, 3])).toEqual({ domain: [2.5, 3], ticks: [2.5, 3] });
  });

  it("is at least one step tall when every season is the same", () => {
    expect(halfStepAxis([3, 3])).toEqual({ domain: [3, 3.5], ticks: [3, 3.5] });
  });

  it("rounds each end outward, never inward", () => {
    expect(halfStepAxis([2.62, 3.04])).toEqual({ domain: [2.5, 3.5], ticks: [2.5, 3, 3.5] });
  });
});

describe("goalsPerGameSeries", () => {
  it("draws every season with five matches, oldest first, the active one flagged", () => {
    const series = goalsPerGameSeries(
      [
        { seasonId: 2025, matches: 380, goals: 1140 },
        { seasonId: 2024, matches: 380, goals: 1064 },
        { seasonId: 2026, matches: 5, goals: 15 },
      ],
      2026
    );

    expect(series).toEqual({
      status: "ok",
      points: [
        { seasonId: 2024, matches: 380, perGame: 2.8, inProgress: false },
        { seasonId: 2025, matches: 380, perGame: 3, inProgress: false },
        { seasonId: 2026, matches: 5, perGame: 3, inProgress: true },
      ],
      yDomain: [2.5, 3],
      yTicks: [2.5, 3],
      leftOut: [],
    });
  });

  it("leaves out a season under five matches and names it, but not one with none (S8, S14)", () => {
    const series = goalsPerGameSeries(
      [
        { seasonId: 2027, matches: 0, goals: 0 },
        { seasonId: 2026, matches: 4, goals: 12 },
        { seasonId: 2024, matches: 132, goals: 330 },
        { seasonId: 2025, matches: 132, goals: 396 },
        { seasonId: 2023, matches: 1, goals: 2 },
      ],
      2026
    );

    expect(series).toMatchObject({ status: "ok", leftOut: [2023, 2026] });
    expect(series.status === "ok" && series.points.map((point) => point.seasonId)).toEqual([
      2024, 2025,
    ]);
  });

  it.each([
    ["no season", []],
    ["one season", [{ seasonId: 2024, matches: 380, goals: 1064 }]],
    [
      "one season beside one too short",
      [
        { seasonId: 2024, matches: 380, goals: 1064 },
        { seasonId: 2025, matches: 4, goals: 9 },
      ],
    ],
  ])("is too few to draw with %s (S10)", (_name, seasons) => {
    expect(goalsPerGameSeries(seasons, 2025)).toEqual({ status: "too-few" });
  });
});
