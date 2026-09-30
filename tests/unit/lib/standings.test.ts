import { describe, expect, it } from "vitest";
import { headToHeadRecord } from "@/lib/head-to-head";
import { calculateStandings, type NormalizedMatch, toFinishedMatches } from "@/lib/standings";

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

  it("shows a team with no finished matches as a zero-stats row when it appears in rosterMatches", () => {
    const standings = calculateStandings(
      [match({})],
      [
        {
          homeTeamProviderId: 1,
          homeTeamName: "Arsenal FC",
          awayTeamProviderId: 2,
          awayTeamName: "Chelsea FC",
        },
        {
          homeTeamProviderId: 3,
          homeTeamName: "Brighton FC",
          awayTeamProviderId: 1,
          awayTeamName: "Arsenal FC",
        },
      ]
    );

    const brighton = standings.find((team) => team.teamName === "Brighton FC");
    expect(brighton).toMatchObject({
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      form: [],
    });
  });

  it("sorts two winless teams alphabetically, below a team with points", () => {
    const standings = calculateStandings(
      [match({})],
      [
        {
          homeTeamProviderId: 1,
          homeTeamName: "Arsenal FC",
          awayTeamProviderId: 2,
          awayTeamName: "Chelsea FC",
        },
        {
          homeTeamProviderId: 4,
          homeTeamName: "Everton FC",
          awayTeamProviderId: 3,
          awayTeamName: "Brighton FC",
        },
      ]
    );

    // Chelsea lost (0 points, -1 goal difference), so it ties on points but not goal difference with the unplayed teams.
    expect(standings.map((team) => team.teamName)).toEqual([
      "Arsenal FC",
      "Brighton FC",
      "Everton FC",
      "Chelsea FC",
    ]);
  });

  it("defaults rosterMatches to the finished-match list, unchanged from before this parameter existed", () => {
    expect(calculateStandings([match({})]).map((team) => team.teamName)).toEqual([
      "Arsenal FC",
      "Chelsea FC",
    ]);
  });
});

describe("toFinishedMatches and a penalty shoot-out (#495)", () => {
  /**
   * The Anfield leg as football-data stores it: `fullTime` 1–5, which is 0–1
   * after extra time and a 1–4 shoot-out.
   */
  const stored = {
    ...match({ homeTeamProviderId: 64, homeTeamName: "Liverpool FC", awayTeamProviderId: 524 }),
    awayTeamName: "Paris Saint-Germain FC",
    status: "FINISHED",
    homeGoals: 1,
    awayGoals: 5,
    penaltiesHome: 1,
    penaltiesAway: 4,
  };

  it("reads a match's score after extra time, without its shoot-out", () => {
    expect(toFinishedMatches([stored])[0]).toMatchObject({ homeGoals: 0, awayGoals: 1 });
  });

  it("leaves a match without a shoot-out as it is stored", () => {
    const plain = {
      ...stored,
      homeGoals: 2,
      awayGoals: 1,
      penaltiesHome: null,
      penaltiesAway: null,
    };

    expect(toFinishedMatches([plain])[0]).toBe(plain);
  });

  it("does not treat half a shoot-out as one", () => {
    const half = { ...stored, penaltiesAway: null };

    expect(toFinishedMatches([half])[0]).toMatchObject({ homeGoals: 1, awayGoals: 5 });
  });

  it("leaves a TASO row, which has no shoot-out columns, as it is", () => {
    const { penaltiesHome: _home, penaltiesAway: _away, ...taso } = stored;

    expect(toFinishedMatches([taso])[0]).toBe(taso);
  });

  it("makes a tie level after extra time a draw in the head-to-head record, 1–1 not 5–4", () => {
    // A 1–1 settled 4–3 on penalties, stored as 5–4.
    const level = { ...stored, homeGoals: 5, awayGoals: 4, penaltiesHome: 4, penaltiesAway: 3 };

    expect(headToHeadRecord(toFinishedMatches([level]), 64)).toMatchObject({
      wins: 0,
      draws: 1,
      losses: 0,
      goalsFor: 1,
      goalsAgainst: 1,
    });
  });
});
