import { describe, expect, it } from "vitest";
import {
  finalPlaces,
  judgeByPlaces,
  judgeUpper,
  LAST_PLACE,
  parseSeasonGuess,
  SEASON_KINDS,
  SEASON_PRICES,
  SEASON_REWARDS,
  SEASON_TEAM_COUNTS,
  sameSeasonGuess,
  upperSix,
} from "@/lib/guessing-game-season";

/**
 * Arvauspeli's season guess rules: the kinds and their figures, the shape a
 * guess from the browser must have, and how a finished season judges each.
 *
 * decisions/075-season-guesses.md
 */

const TEAMS = Array.from({ length: 12 }, (_, index) => 100 + index);
const SEASON = new Set(TEAMS);

describe("the kinds", () => {
  it("are four, with their prices, team counts and rewards", () => {
    expect(SEASON_KINDS).toEqual(["champion", "upper", "last", "table"]);
    expect(SEASON_PRICES).toEqual({ champion: 50, upper: 50, last: 50, table: 100 });
    expect(SEASON_TEAM_COUNTS).toEqual({ champion: 1, upper: 6, last: 1, table: 12 });
    expect(SEASON_REWARDS).toEqual({
      champion: 200,
      last: 200,
      upperTeam: 15,
      tableExact: 30,
      tableNear: 10,
    });
    expect(LAST_PLACE).toBe(12);
  });
});

describe("parseSeasonGuess", () => {
  it("takes each kind with as many distinct teams of the season as it names", () => {
    expect(parseSeasonGuess({ kind: "champion", teams: [100] }, SEASON)).toEqual({
      kind: "champion",
      teams: [100],
    });
    expect(parseSeasonGuess({ kind: "upper", teams: TEAMS.slice(0, 6) }, SEASON)).toEqual({
      kind: "upper",
      teams: TEAMS.slice(0, 6),
    });
    expect(parseSeasonGuess({ kind: "last", teams: [111] }, SEASON)).toEqual({
      kind: "last",
      teams: [111],
    });
    expect(parseSeasonGuess({ kind: "table", teams: TEAMS }, SEASON)).toEqual({
      kind: "table",
      teams: TEAMS,
    });
  });

  it("copies the teams, so the caller's array is not kept", () => {
    const teams = [100];
    const guess = parseSeasonGuess({ kind: "champion", teams }, SEASON);

    expect(guess?.teams).not.toBe(teams);
  });

  it("refuses the wrong number of teams for a kind", () => {
    expect(parseSeasonGuess({ kind: "champion", teams: [100, 101] }, SEASON)).toBeNull();
    expect(parseSeasonGuess({ kind: "upper", teams: TEAMS.slice(0, 5) }, SEASON)).toBeNull();
    expect(parseSeasonGuess({ kind: "table", teams: TEAMS.slice(0, 11) }, SEASON)).toBeNull();
  });

  it("refuses an unknown kind, teams that are not a list, and what is not an object", () => {
    expect(parseSeasonGuess({ kind: "runner-up", teams: [100] }, SEASON)).toBeNull();
    expect(parseSeasonGuess({ kind: 3, teams: [100] }, SEASON)).toBeNull();
    expect(parseSeasonGuess({ kind: "champion", teams: "100" }, SEASON)).toBeNull();
    expect(parseSeasonGuess({ teams: [100] }, SEASON)).toBeNull();
    expect(parseSeasonGuess(null, SEASON)).toBeNull();
    expect(parseSeasonGuess("champion", SEASON)).toBeNull();
  });

  it("refuses a team that is not a number, or not of the season", () => {
    expect(parseSeasonGuess({ kind: "champion", teams: ["100"] }, SEASON)).toBeNull();
    expect(parseSeasonGuess({ kind: "champion", teams: [999] }, SEASON)).toBeNull();
  });

  it("refuses a team named twice", () => {
    expect(
      parseSeasonGuess({ kind: "upper", teams: [100, 101, 102, 103, 104, 100] }, SEASON)
    ).toBeNull();
  });
});

describe("sameSeasonGuess", () => {
  it("reads the six as the same in any order", () => {
    expect(
      sameSeasonGuess(
        { kind: "upper", teams: [1, 2, 3, 4, 5, 6] },
        { kind: "upper", teams: [6, 5, 4, 3, 2, 1] }
      )
    ).toBe(true);
    expect(
      sameSeasonGuess(
        { kind: "upper", teams: [1, 2, 3, 4, 5, 6] },
        { kind: "upper", teams: [1, 2, 3, 4, 5, 7] }
      )
    ).toBe(false);
  });

  it("reads a table, or a single team, in its own order", () => {
    expect(
      sameSeasonGuess({ kind: "table", teams: [1, 2, 3] }, { kind: "table", teams: [1, 2, 3] })
    ).toBe(true);
    expect(
      sameSeasonGuess({ kind: "table", teams: [1, 2, 3] }, { kind: "table", teams: [2, 1, 3] })
    ).toBe(false);
    expect(
      sameSeasonGuess({ kind: "champion", teams: [1] }, { kind: "champion", teams: [2] })
    ).toBe(false);
  });

  it("is never the same across kinds or lengths", () => {
    expect(sameSeasonGuess({ kind: "champion", teams: [1] }, { kind: "last", teams: [1] })).toBe(
      false
    );
    expect(
      sameSeasonGuess({ kind: "upper", teams: [1, 2] }, { kind: "upper", teams: [1, 2, 3] })
    ).toBe(false);
  });
});

describe("the answers", () => {
  it("takes the regular season's top six as the teams reaching Mestaruussarja", () => {
    const regular = TEAMS.map((team, index) => ({ position: index + 1, teamProviderId: team }));

    expect(upperSix(regular)).toEqual(new Set(TEAMS.slice(0, 6)));
  });

  it("places Mestaruussarja's teams 1 to 6, and Karsintasarja's 7 to 12", () => {
    const upper = [
      { position: 1, teamProviderId: 105 },
      { position: 2, teamProviderId: 100 },
    ];
    const lower = [
      { position: 1, teamProviderId: 106 },
      { position: 6, teamProviderId: 111 },
    ];

    expect(finalPlaces(upper, lower)).toEqual(
      new Map([
        [105, 1],
        [100, 2],
        [106, 7],
        [111, 12],
      ])
    );
  });
});

describe("judgeUpper", () => {
  it("pays 15 for each of the six that reached Mestaruussarja", () => {
    const upper = new Set([1, 2, 3, 4, 5, 6]);

    expect(judgeUpper([1, 2, 3, 4, 9, 10], upper)).toEqual({ reward: 60, right: 4, near: 0 });
    expect(judgeUpper([1, 2, 3, 4, 5, 6], upper)).toEqual({ reward: 90, right: 6, near: 0 });
    expect(judgeUpper([7, 8, 9, 10, 11, 12], upper)).toEqual({ reward: 0, right: 0, near: 0 });
  });
});

describe("judgeByPlaces", () => {
  const PLACES = new Map(TEAMS.map((team, index) => [team, index + 1]));

  it("pays 200 for the champion, and nothing for a team that finished elsewhere", () => {
    expect(judgeByPlaces({ kind: "champion", teams: [100] }, PLACES)).toEqual({
      reward: 200,
      right: 1,
      near: 0,
    });
    expect(judgeByPlaces({ kind: "champion", teams: [101] }, PLACES)).toEqual({
      reward: 0,
      right: 0,
      near: 0,
    });
  });

  it("pays 200 for the team in 12th place, and nothing for the 11th", () => {
    expect(judgeByPlaces({ kind: "last", teams: [111] }, PLACES)).toEqual({
      reward: 200,
      right: 1,
      near: 0,
    });
    expect(judgeByPlaces({ kind: "last", teams: [110] }, PLACES)).toEqual({
      reward: 0,
      right: 0,
      near: 0,
    });
  });

  it("pays a table 30 for each exact place and 10 for each place one off, nothing further", () => {
    // 100 and 101 swapped: one place off each; 102 and 105 swapped: three off;
    // the other eight exact.
    const table = [101, 100, 105, 103, 104, 102, ...TEAMS.slice(6)];

    expect(judgeByPlaces({ kind: "table", teams: table }, PLACES)).toEqual({
      reward: 8 * 30 + 2 * 10,
      right: 8,
      near: 2,
    });
    expect(judgeByPlaces({ kind: "table", teams: TEAMS }, PLACES)).toEqual({
      reward: 360,
      right: 12,
      near: 0,
    });
  });

  it("misses on a team with no final place, one that withdrew, and judges the rest", () => {
    const withdrawn = new Map(PLACES);
    withdrawn.delete(100);

    expect(judgeByPlaces({ kind: "table", teams: TEAMS }, withdrawn)).toEqual({
      reward: 11 * 30,
      right: 11,
      near: 0,
    });
    expect(judgeByPlaces({ kind: "champion", teams: [100] }, withdrawn)).toEqual({
      reward: 0,
      right: 0,
      near: 0,
    });
  });
});
