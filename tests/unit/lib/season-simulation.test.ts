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
 * decisions/064-season-simulation-zones.md
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

  it("counts an open place in the bottom three run by run", () => {
    // Team 2 passes team 1, which ends second of four: in the bottom three,
    // though it could still have finished first.
    const rows = simulateTable(
      [row(1, 3), row(2, 3), row(3, 0), row(4, 0)],
      [fixture(2, 3, DRAWN), fixture(1, 4, AWAY_WINS)],
      10
    );

    expect(rows.map((team) => team.bottomThree)).toEqual([
      { share: 1, settled: false },
      { share: 0, settled: false },
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

describe("simulateTable's zones", () => {
  const zone = (from: number, to: number) => ({ from, to, label: `Places ${from} to ${to}` });
  const table = [row(1, 9), row(2, 6), row(3, 3), row(4, 0)];

  it("settles a middle stretch: certain for the teams inside it, out of reach for the rest", () => {
    const rows = simulateTable(table, [], 10, 61, [zone(2, 3)]);

    expect(rows.map((team) => team.zones[0])).toEqual([
      { share: 0, settled: true },
      { share: 1, settled: true },
      { share: 1, settled: true },
      { share: 0, settled: true },
    ]);
  });

  it("leaves a stretch the team can still reach open, with its share of the runs", () => {
    // One fixture between the two on top, level on points: team 1 wins it or
    // draws and stays first, team 2 is first when it wins.
    const rows = simulateTable(
      [row(1, 0), row(2, 0), row(3, 0)],
      [fixture(1, 2, [0.5, 0.2, 0.3])],
      10_000,
      61,
      [zone(1, 1), zone(2, 3)]
    );

    expect(rows[0]?.zones[0]?.settled).toBe(false);
    expect(rows[0]?.zones[0]?.share).toBeGreaterThan(0.68);
    expect(rows[0]?.zones[0]?.share).toBeLessThan(0.72);
    expect(rows[0]?.zones[1]?.share).toBeCloseTo(1 - (rows[0]?.zones[0]?.share ?? 0), 10);
  });

  it("agrees with first place and the bottom three when the zone is the same stretch", () => {
    const four = [row(1, 3), row(2, 3), row(3, 1), row(4, 0)];
    const fixtures = [fixture(2, 1, [0.4, 0.3, 0.3]), fixture(4, 3, [0.3, 0.3, 0.4])];
    const rows = simulateTable(four, fixtures, 2_000, 61, [zone(1, 1), zone(2, 4)]);

    expect(rows.map((team) => team.zones[0])).toEqual(rows.map((team) => team.first));
    expect(rows.map((team) => team.zones[1])).toEqual(rows.map((team) => team.bottomThree));
  });

  it("counts a team only in the places the zone covers", () => {
    // Team 2 finishes second in every run, team 3 third: a zone of the third
    // place alone holds team 3 and nobody else.
    const rows = simulateTable(table, [fixture(4, 3, HOME_WINS)], 10, 61, [zone(3, 3)]);

    expect(rows.map((team) => team.zones[0]?.share)).toEqual([0, 0, 1, 0]);
  });

  it("puts a stretch that is out of reach from below at zero, and from above too", () => {
    // Team 3 on 3 points with a win left can reach 6: still short of team 2's 6
    // on the tie rule, so places 1–2 are out of its reach; and team 2 cannot fall
    // below third.
    const rows = simulateTable(table, [fixture(3, 4, HOME_WINS)], 10, 61, [zone(1, 2), zone(4, 4)]);

    expect(rows[2]?.zones[0]).toEqual({ share: 0, settled: true });
    expect(rows[1]?.zones[1]).toEqual({ share: 0, settled: true });
  });

  it("gives every row a chance for every zone, none when there are none", () => {
    expect(simulateTable(table, [], 10).every((team) => team.zones.length === 0)).toBe(true);
    expect(
      simulateTable(table, [], 10, 61, [zone(1, 1), zone(2, 4)]).every(
        (team) => team.zones.length === 2
      )
    ).toBe(true);
  });
});

describe("seasonForecast", () => {
  function table(overrides: Partial<SeasonTableInput> = {}): SeasonTableInput {
    return {
      groupId: 0,
      groupName: null,
      simulated: true,
      rows: [row(1, 3), row(2, 0)],
      fixtures: [{ homeTeam: 1, awayTeam: 2 }],
      levels: [],
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
          groupId: 0,
          groupName: null,
          decidesTitle: true,
          zones: [],
          rows: simulateTable([row(1, 3), row(2, 0)], [{ homeTeam: 1, awayTeam: 2, ...homeWin() }]),
        },
      ],
      leftOut: [],
    });
    expect(forecast.status === "ok" && forecast.tables[0]?.rows[0]?.expectedPoints).toBe(6);
  });

  it("turns a group's levels into the zones of its table and counts them", () => {
    const levels = [
      { level: 1, teamCount: 1, label: "Nousee" },
      { level: 2, teamCount: 1, label: null },
    ];
    const forecast = seasonForecast("single", [table({ levels })], homeWin);

    const first = forecast.status === "ok" ? forecast.tables[0] : undefined;
    // The unlabelled second level takes a place and shows nothing.
    expect(first?.zones).toEqual([{ from: 1, to: 1, label: "Nousee" }]);
    expect(first?.rows.map((team) => team.zones)).toEqual([
      [{ share: 1, settled: true }],
      [{ share: 0, settled: true }],
    ]);
  });

  it("cuts a level at the table's last row when its count is larger", () => {
    const levels = [{ level: 1, teamCount: 5, label: "Putoaa" }];
    const forecast = seasonForecast("single", [table({ levels })], homeWin);

    expect(forecast.status === "ok" && forecast.tables[0]?.zones).toEqual([
      { from: 1, to: 2, label: "Putoaa" },
    ]);
  });

  it("gives a group with no labelled level no zone", () => {
    const levels = [{ level: 1, teamCount: 1, label: null }];
    const forecast = seasonForecast("single", [table({ levels })], homeWin);

    expect(forecast.status === "ok" && forecast.tables[0]?.zones).toEqual([]);
    expect(forecast.status === "ok" && forecast.tables[0]?.rows[0]?.zones).toEqual([]);
  });

  it("decides zones group by group, so a group without levels keeps its own columns", () => {
    const levels = [{ level: 1, teamCount: 1, label: "Kultaa" }];
    const forecast = seasonForecast(
      "several",
      [table({ groupId: 1, groupName: "A", levels }), table({ groupId: 2, groupName: "B" })],
      homeWin
    );

    expect(forecast.status === "ok" && forecast.tables.map((each) => each.zones.length)).toEqual([
      1, 0,
    ]);
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

  it("has nothing to play out when no table of the season has a fixture left", () => {
    expect(
      seasonForecast(
        "several",
        [table({ fixtures: [] }), table({ simulated: false, fixtures: [] })],
        homeWin
      )
    ).toEqual({ status: "no-fixtures" });
  });

  it("does not say nothing is left when a table that is not ours still has a fixture", () => {
    // Ours is finished; the fixtures left are in a table shown from TASO's numbers.
    expect(
      seasonForecast("several", [table({ fixtures: [] }), table({ simulated: false })], homeWin)
    ).toEqual({ status: "not-simulated" });
  });

  it("carries each table's group id", () => {
    const forecast = seasonForecast(
      "several",
      [table({ groupId: 4, groupName: "A" }), table({ groupId: 7, groupName: "B" })],
      homeWin
    );

    expect(forecast.status === "ok" && forecast.tables.map((each) => each.groupId)).toEqual([4, 7]);
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

  it("names the tables that are not ours beside the ones simulated, in the page's order", () => {
    const forecast = seasonForecast(
      "several",
      [
        table({ groupName: "Mestaruussarja", simulated: false }),
        table({ groupName: "Karsintasarja" }),
        table({ groupName: "Haastajasarja", simulated: false, fixtures: [] }),
      ],
      homeWin
    );

    expect(forecast).toMatchObject({
      tables: [{ groupName: "Karsintasarja" }],
      leftOut: ["Mestaruussarja", "Haastajasarja"],
    });
  });

  it("names no table when all are simulated, nor one stored without a name", () => {
    expect(
      seasonForecast("several", [table({ groupName: "A" }), table({ groupName: "B" })], homeWin)
    ).toMatchObject({ leftOut: [] });
    expect(
      seasonForecast("several", [table(), table({ simulated: false })], homeWin)
    ).toMatchObject({ leftOut: [] });
  });

  it("leaves out a fixture the model cannot predict", () => {
    const forecast = seasonForecast("single", [table()], () => null);

    expect(
      forecast.status === "ok" && forecast.tables[0]?.rows.map((team) => team.expectedPoints)
    ).toEqual([3, 0]);
  });
});
