import { describe, expect, it } from "vitest";
import { calculateStandings, type NormalizedMatch } from "@/lib/standings";

const match = (overrides: Partial<NormalizedMatch>): NormalizedMatch => ({
  providerMatchId: 1,
  competitionCode: "PL",
  seasonId: 2026,
  kickoffAt: new Date("2026-08-01T15:00:00Z"),
  matchday: 1,
  homeTeamProviderId: 1,
  homeTeamName: "Arsenal FC",
  awayTeamProviderId: 2,
  awayTeamName: "Chelsea FC",
  homeGoals: 2,
  awayGoals: 1,
  ...overrides,
});

describe("calculateStandings", () => {
  it("calculates points, goals, and deterministic sorting", () => {
    const standings = calculateStandings([
      match({}),
      match({
        providerMatchId: 2,
        kickoffAt: new Date("2026-08-08T15:00:00Z"),
        homeTeamProviderId: 2,
        homeTeamName: "Chelsea FC",
        awayTeamProviderId: 3,
        awayTeamName: "Brighton FC",
        homeGoals: 0,
        awayGoals: 0,
      }),
      match({
        providerMatchId: 3,
        kickoffAt: new Date("2026-08-15T15:00:00Z"),
        homeTeamProviderId: 3,
        homeTeamName: "Brighton FC",
        awayTeamProviderId: 1,
        awayTeamName: "Arsenal FC",
        homeGoals: 3,
        awayGoals: 0,
      }),
    ]);

    expect(
      standings.map(({ teamName, points, goalDifference }) => ({
        teamName,
        points,
        goalDifference,
      }))
    ).toEqual([
      { teamName: "Brighton FC", points: 4, goalDifference: 3 },
      { teamName: "Arsenal FC", points: 3, goalDifference: -2 },
      { teamName: "Chelsea FC", points: 1, goalDifference: -1 },
    ]);
  });

  it("limits form to five matches and displays it chronologically", () => {
    const matches = Array.from({ length: 6 }, (_, index) =>
      match({
        providerMatchId: index + 1,
        kickoffAt: new Date(`2026-08-${String(index + 1).padStart(2, "0")}T15:00:00Z`),
        homeGoals: index % 2,
        awayGoals: 1,
      })
    );

    expect(
      calculateStandings(matches).find((team) => team.teamName === "Arsenal FC")?.form
    ).toEqual([
      { matchId: 2, result: "T", label: "Tasapeli" },
      { matchId: 3, result: "H", label: "Häviö" },
      { matchId: 4, result: "T", label: "Tasapeli" },
      { matchId: 5, result: "H", label: "Häviö" },
      { matchId: 6, result: "T", label: "Tasapeli" },
    ]);
  });

  it("returns an empty array for no matches", () => {
    expect(calculateStandings([])).toEqual([]);
  });

  it("breaks a full points and goal-difference tie by team name", () => {
    const standings = calculateStandings([
      match({
        providerMatchId: 1,
        homeTeamProviderId: 1,
        homeTeamName: "Brighton FC",
        awayTeamProviderId: 2,
        awayTeamName: "Arsenal FC",
        homeGoals: 1,
        awayGoals: 1,
      }),
    ]);

    expect(standings.map((team) => team.teamName)).toEqual(["Arsenal FC", "Brighton FC"]);
  });
});
