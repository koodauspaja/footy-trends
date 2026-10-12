import { describe, expect, it } from "vitest";
import {
  isRemainingFixture,
  type SeasonTableInput,
  SIMULATION_RUNS,
  SIMULATION_SEED,
  type SimulatedFixture,
  seasonForecast,
  simulateTable,
  type TableRow,
} from "@/lib/season-simulation";

/**
 * The season simulation's rules: which matches are still to be played, a run's
 * points and ranking, ties, the settled places, the seed, and which tables of
 * a season are simulated.
 *
 * decisions/061-season-simulation.md
 */

function row(teamProviderId: number, points: number): TableRow {
  return { teamProviderId, teamName: `Team ${teamProviderId}`, points };
}

function fixture(
  homeTeam: number,
  awayTeam: number,
  [home, draw, away]: [number, number, number]
): SimulatedFixture {
  return { homeTeam, awayTeam, prediction: { home, draw, away } };
}

const HOME_WINS: [number, number, number] = [1, 0, 0];
const DRAWN: [number, number, number] = [0, 1, 0];
const AWAY_WINS: [number, number, number] = [0, 0, 1];

describe("isRemainingFixture", () => {
  const sides = { homeTeamProviderId: 1, awayTeamProviderId: 2 };

  it.each(["SCHEDULED", "TIMED", "POSTPONED", "IN_PLAY", "Break"])(
    "counts a %s match as still to be played",
    (status) => {
      expect(isRemainingFixture({ status, ...sides })).toBe(true);
    }
  );

  it.each(["FINISHED", "CANCELLED", "AWARDED", "Abandoned"])(
    "does not count a %s match",
    (status) => {
      expect(isRemainingFixture({ status, ...sides })).toBe(false);
    }
  );

  it("does not count a match with a placeholder on either side", () => {
    expect(isRemainingFixture({ status: "SCHEDULED", ...sides, homeTeamProviderId: 0 })).toBe(
      false
    );
    expect(isRemainingFixture({ status: "SCHEDULED", ...sides, awayTeamProviderId: 0 })).toBe(
      false
    );
  });
});

describe("simulateTable", () => {
  it("plays 10 000 runs from seed 61 unless told otherwise", () => {
    const table = [row(1, 0), row(2, 0)];
    const fixtures = [fixture(1, 2, [0.5, 0.2, 0.3])];

    expect(SIMULATION_RUNS).toBe(10_000);
    expect(SIMULATION_SEED).toBe(61);
    expect(simulateTable(table, fixtures)).toEqual(simulateTable(table, fixtures, 10_000, 61));
    expect(simulateTable(table, fixtures)).not.toEqual(simulateTable(table, fixtures, 9_999, 61));
  });

  it("gives a home win three points to the home side", () => {
    const [first, second] = simulateTable([row(1, 0), row(2, 1)], [fixture(1, 2, HOME_WINS)], 50);

    expect(first?.expectedPoints).toBe(3);
    expect(second?.expectedPoints).toBe(1);
    expect(first?.first.share).toBe(1);
    expect(second?.last.share).toBe(1);
  });

  it("gives an away win three points to the away side", () => {
    const [first, second] = simulateTable([row(1, 1), row(2, 0)], [fixture(1, 2, AWAY_WINS)], 50);

    expect(first?.expectedPoints).toBe(1);
    expect(second?.expectedPoints).toBe(3);
    expect(second?.first.share).toBe(1);
    expect(first?.last.share).toBe(1);
  });

  it("gives a draw a point to each side", () => {
    const rows = simulateTable([row(1, 0), row(2, 0)], [fixture(1, 2, DRAWN)], 50);

    expect(rows.map((team) => team.expectedPoints)).toEqual([1, 1]);
  });

  it("ranks teams level on points in the current table's order", () => {
    // Team 2 catches team 1 on points and stays behind it; team 3 stays last.
    const rows = simulateTable([row(1, 3), row(2, 0), row(3, 0)], [fixture(2, 3, HOME_WINS)], 50);

    expect(rows.map((team) => team.first.share)).toEqual([1, 0, 0]);
    expect(rows.map((team) => team.last.share)).toEqual([0, 0, 1]);
  });

  it("returns the teams in the table's order, with their names", () => {
    const rows = simulateTable([row(7, 0), row(3, 0)], [fixture(3, 7, HOME_WINS)], 10);

    expect(rows.map((team) => [team.teamProviderId, team.teamName])).toEqual([
      [7, "Team 7"],
      [3, "Team 3"],
    ]);
  });

  it("draws each result from the fixture's three probabilities", () => {
    const [home, away] = simulateTable([row(1, 0), row(2, 0)], [fixture(1, 2, [0.5, 0.2, 0.3])]);

    // Home 3 × 0,5 + 0,2; away 3 × 0,3 + 0,2. Level on points the home side,
    // first in the table, stays first: 0,5 + 0,2.
    expect(home?.expectedPoints).toBeCloseTo(1.7, 1);
    expect(away?.expectedPoints).toBeCloseTo(1.1, 1);
    expect(home?.first.share).toBeGreaterThan(0.68);
    expect(home?.first.share).toBeLessThan(0.72);
    expect(away?.first.share).toBeCloseTo(1 - (home?.first.share ?? 0), 10);
  });

  it("gives the same figures for the same seed, and others for another", () => {
    const table = [row(1, 0), row(2, 0), row(3, 0)];
    const fixtures = [fixture(1, 2, [0.4, 0.3, 0.3]), fixture(2, 3, [0.4, 0.3, 0.3])];

    expect(simulateTable(table, fixtures, 500, 7)).toEqual(simulateTable(table, fixtures, 500, 7));
    expect(simulateTable(table, fixtures, 500, 7)).not.toEqual(
      simulateTable(table, fixtures, 500, 8)
    );
  });

  it("counts the top three and the bottom three of a table", () => {
    const rows = simulateTable([row(1, 9), row(2, 6), row(3, 3), row(4, 0)], [], 10);

    expect(rows.map((team) => team.topThree)).toEqual([
      { share: 1, settled: true },
      { share: 1, settled: true },
      { share: 1, settled: true },
      { share: 0, settled: true },
    ]);
    expect(rows.map((team) => team.bottomThree)).toEqual([
      { share: 0, settled: true },
      { share: 1, settled: true },
      { share: 1, settled: true },
      { share: 1, settled: true },
    ]);
  });

  it("settles every place of a table with no fixture left", () => {
    const rows = simulateTable([row(1, 9), row(2, 6), row(3, 3)], [], 10);

    expect(rows.map((team) => team.first)).toEqual([
      { share: 1, settled: true },
      { share: 0, settled: true },
      { share: 0, settled: true },
    ]);
    expect(rows.map((team) => team.last)).toEqual([
      { share: 0, settled: true },
      { share: 0, settled: true },
      { share: 1, settled: true },
    ]);
    expect(rows.map((team) => team.expectedPoints)).toEqual([9, 6, 3]);
  });

  it("settles first place when nobody can reach the leader, and not before", () => {
    // Team 2 can reach 9 at most: level with team 1, which the order keeps first.
    const out = simulateTable([row(1, 9), row(2, 6), row(3, 0)], [fixture(2, 3, HOME_WINS)], 10);
    expect(out[0]?.first).toEqual({ share: 1, settled: true });
    expect(out[1]?.first).toEqual({ share: 0, settled: true });

    // One point more within reach and it is open, though no run gets there.
    const open = simulateTable([row(1, 8), row(2, 6), row(3, 0)], [fixture(2, 3, AWAY_WINS)], 10);
    expect(open[0]?.first).toEqual({ share: 1, settled: false });
    expect(open[1]?.first).toEqual({ share: 0, settled: false });
  });

  it("settles last place when the bottom team cannot pass anyone, and not before", () => {
    // Team 3 can reach 3 at most: level with team 2, which the order keeps above it.
    const out = simulateTable([row(1, 9), row(2, 3), row(3, 0)], [fixture(3, 1, AWAY_WINS)], 10);
    expect(out[2]?.last).toEqual({ share: 1, settled: true });
    expect(out[1]?.last).toEqual({ share: 0, settled: true });

    const open = simulateTable([row(1, 9), row(2, 2), row(3, 0)], [fixture(3, 1, AWAY_WINS)], 10);
    expect(open[2]?.last).toEqual({ share: 1, settled: false });
    expect(open[1]?.last).toEqual({ share: 0, settled: false });
  });

  it("settles the top three and the bottom three on the same two bounds", () => {
    // Four teams: the third place is the edge of both.
    const table = [row(1, 9), row(2, 9), row(3, 4), row(4, 0)];

    // Team 4 can reach 3 at most, under team 3's 4.
    const out = simulateTable(table, [fixture(4, 1, AWAY_WINS)], 10);
    expect(out[3]?.topThree).toEqual({ share: 0, settled: true });
    expect(out[2]?.topThree).toEqual({ share: 1, settled: true });
    expect(out[0]?.bottomThree).toEqual({ share: 0, settled: true });

    // Two fixtures and it can reach 6: open, and team 1 could be passed for first.
    const open = simulateTable(table, [fixture(4, 1, AWAY_WINS), fixture(4, 2, AWAY_WINS)], 10);
    expect(open[3]?.topThree).toEqual({ share: 0, settled: false });
    expect(open[2]?.topThree).toEqual({ share: 1, settled: false });
    expect(open[2]?.bottomThree).toEqual({ share: 1, settled: true });
    expect(open[3]?.bottomThree).toEqual({ share: 1, settled: true });
  });

  it("leaves out a fixture with a side that is not in the table", () => {
    const rows = simulateTable(
      [row(1, 0), row(2, 0)],
      [fixture(1, 99, HOME_WINS), fixture(99, 2, AWAY_WINS)],
      10
    );

    expect(rows.map((team) => team.expectedPoints)).toEqual([0, 0]);
    expect(rows[0]?.first).toEqual({ share: 1, settled: true });
  });
});

describe("seasonForecast", () => {
  function table(overrides: Partial<SeasonTableInput> = {}): SeasonTableInput {
    return {
      groupName: null,
      simulated: true,
      rows: [row(1, 3), row(2, 0)],
      fixtures: [{ homeTeam: 1, awayTeam: 2 }],
      ...overrides,
    };
  }
  const homeWin = () => ({ prediction: { home: 1, draw: 0, away: 0 } });

  it("simulates a season's one table, whose first place is the title", () => {
    const forecast = seasonForecast("single", [table()], homeWin);

    expect(forecast).toEqual({
      status: "ok",
      layout: "single",
      tables: [
        {
          groupName: null,
          decidesTitle: true,
          rows: simulateTable([row(1, 3), row(2, 0)], [{ homeTeam: 1, awayTeam: 2, ...homeWin() }]),
        },
      ],
    });
    expect(forecast.status === "ok" && forecast.tables[0]?.rows[0]?.expectedPoints).toBe(6);
  });

  it("asks the model for each fixture's own two sides", () => {
    const asked: Array<[number, number]> = [];
    seasonForecast(
      "single",
      [table({ fixtures: [{ homeTeam: 2, awayTeam: 1 }] })],
      (home, away) => {
        asked.push([home, away]);
        return homeWin();
      }
    );

    expect(asked).toEqual([[2, 1]]);
  });

  it("calls first place the title only in a group named Mestaruussarja", () => {
    const forecast = seasonForecast(
      "several",
      [table({ groupName: "Mestaruussarja" }), table({ groupName: "Karsintasarja" })],
      homeWin
    );

    expect(
      forecast.status === "ok" &&
        forecast.tables.map(({ groupName, decidesTitle }) => [groupName, decidesTitle])
    ).toEqual([
      ["Mestaruussarja", true],
      ["Karsintasarja", false],
    ]);
  });

  it("does not call a regular season's first place the title before a split", () => {
    const forecast = seasonForecast("before-split", [table({ groupName: "Runkosarja" })], homeWin);

    expect(forecast).toMatchObject({
      layout: "before-split",
      tables: [{ groupName: "Runkosarja", decidesTitle: false }],
    });
  });

  it("shows a table with no fixture left beside one that has, every place settled", () => {
    const forecast = seasonForecast(
      "several",
      [table({ groupName: "A" }), table({ groupName: "B", fixtures: [] })],
      homeWin
    );

    expect(forecast.status === "ok" && forecast.tables.map((each) => each.groupName)).toEqual([
      "A",
      "B",
    ]);
    expect(forecast.status === "ok" && forecast.tables[1]?.rows.map((team) => team.first)).toEqual([
      { share: 1, settled: true },
      { share: 0, settled: true },
    ]);
  });

  it("has nothing to play out when no simulated table has a fixture left", () => {
    expect(
      seasonForecast("several", [table({ fixtures: [] }), table({ simulated: false })], homeWin)
    ).toEqual({ status: "no-fixtures" });
  });

  it("leaves out a table that is not ours, and says so when none is", () => {
    const mixed = seasonForecast(
      "several",
      [table({ groupName: "Ours" }), table({ groupName: "Theirs", simulated: false })],
      homeWin
    );
    expect(mixed.status === "ok" && mixed.tables.map((each) => each.groupName)).toEqual(["Ours"]);

    expect(seasonForecast("several", [table({ simulated: false })], homeWin)).toEqual({
      status: "not-simulated",
    });
    expect(seasonForecast("single", [], homeWin)).toEqual({ status: "not-simulated" });
  });

  it("leaves out a fixture the model cannot predict", () => {
    const forecast = seasonForecast("single", [table()], () => null);

    expect(
      forecast.status === "ok" && forecast.tables[0]?.rows.map((team) => team.expectedPoints)
    ).toEqual([3, 0]);
  });
});
