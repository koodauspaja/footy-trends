import { describe, expect, it } from "vitest";
import {
  lastRoundPlayedBy,
  positionsAfterEachRound,
  roundsToPlot,
  singleTableSeries,
  teamsInGroupsAbove,
} from "@/lib/position-series";
import { calculateStandings, type NormalizedMatch } from "@/lib/standings";

/** A finished league match between two numbered teams. */
function played(
  matchday: number | null,
  home: number,
  away: number,
  homeGoals: number,
  awayGoals: number
): NormalizedMatch {
  return {
    providerMatchId: Number(`${matchday ?? 0}${home}${away}`),
    competitionCode: "PL",
    seasonId: 2025,
    kickoffAt: new Date("2025-08-16T14:00:00Z"),
    matchday,
    homeTeamProviderId: home,
    homeTeamName: `Team ${home}`,
    awayTeamProviderId: away,
    awayTeamName: `Team ${away}`,
    homeGoals,
    awayGoals,
  };
}

describe("lastRoundPlayedBy", () => {
  it("finds the latest round in which this team finished a match", () => {
    const finished = [played(1, 1, 2, 1, 0), played(2, 3, 1, 0, 0), played(3, 2, 3, 1, 1)];

    expect(lastRoundPlayedBy(finished, 1)).toBe(2);
  });

  it("keeps the latest round when matches arrive out of round order", () => {
    // Stored order follows the database, not the calendar — a postponed match
    // played late is the usual reason.
    expect(lastRoundPlayedBy([played(3, 1, 2, 1, 0), played(1, 1, 3, 0, 0)], 1)).toBe(3);
  });

  it("counts an away match as well as a home one", () => {
    expect(lastRoundPlayedBy([played(4, 2, 1, 0, 1)], 1)).toBe(4);
  });

  it("reports no round for a team that has not played", () => {
    expect(lastRoundPlayedBy([played(1, 2, 3, 1, 0)], 1)).toBeNull();
  });

  it("counts a match with no round towards none (spec 003)", () => {
    expect(lastRoundPlayedBy([played(null, 1, 2, 1, 0)], 1)).toBeNull();
  });
});

describe("roundsToPlot", () => {
  it("lists each round once, ascending, up to the last one", () => {
    const finished = [
      played(3, 1, 2, 0, 0),
      played(1, 1, 3, 0, 0),
      played(1, 2, 4, 0, 0),
      played(5, 1, 4, 0, 0),
    ];

    expect(roundsToPlot(finished, 3)).toEqual([1, 3]);
  });

  it("includes a round this team sat out, because the table still moved", () => {
    // Team 1 does not play round 2 — a bye, or a postponed match.
    const finished = [played(1, 1, 2, 1, 0), played(2, 3, 2, 2, 0), played(3, 1, 3, 0, 0)];

    expect(roundsToPlot(finished, lastRoundPlayedBy(finished, 1) ?? 0)).toEqual([1, 2, 3]);
  });

  it("leaves out a match with no round", () => {
    expect(roundsToPlot([played(null, 1, 2, 0, 0), played(2, 1, 3, 0, 0)], 2)).toEqual([2]);
  });
});

describe("positionsAfterEachRound", () => {
  const tables: Record<number, Array<{ teamProviderId: number; position: number }>> = {
    1: [
      { teamProviderId: 2, position: 1 },
      { teamProviderId: 1, position: 2 },
    ],
    2: [
      { teamProviderId: 1, position: 1 },
      { teamProviderId: 2, position: 2 },
    ],
  };
  const twoRounds = [played(1, 1, 2, 0, 1), played(2, 1, 2, 1, 0)];
  const tableAfter = (round: number) => tables[round] ?? [];

  it("takes the team's own position from each round's table", () => {
    expect(positionsAfterEachRound(twoRounds, 2, 1, tableAfter)).toEqual([
      { round: 1, position: 2, played: true },
      { round: 2, position: 1, played: true },
    ]);
  });

  it("stops at the last round it is given, even when later ones were played", () => {
    expect(positionsAfterEachRound(twoRounds, 1, 1, tableAfter)).toEqual([
      { round: 1, position: 2, played: true },
    ]);
  });

  it("uses the row's position rather than its index, so it shows what the table shows", () => {
    // Two teams level on everything: whatever the ranking decided is what
    // the standings page displays, and the chart must not re-derive it.
    const shared = [
      { teamProviderId: 2, position: 1 },
      { teamProviderId: 1, position: 1 },
    ];

    expect(positionsAfterEachRound([played(1, 1, 2, 0, 0)], 1, 1, () => shared)).toEqual([
      { round: 1, position: 1, played: true },
    ]);
  });

  it("adds the offset of the groups ranked above, after a split", () => {
    expect(positionsAfterEachRound([played(1, 1, 2, 0, 1)], 1, 1, tableAfter, 6)).toEqual([
      { round: 1, position: 8, played: true },
    ]);
  });

  it("marks a round the team sat out, whose position moved only because others played", () => {
    // Team 1 has no match in round 2 — a bye, or a round TASO numbered out of
    // calendar order. The point is still plotted, as not played (#413).
    const withBye = [played(1, 1, 2, 0, 1), played(2, 2, 3, 1, 0), played(3, 1, 3, 0, 0)];
    const everyone = [
      { teamProviderId: 1, position: 2 },
      { teamProviderId: 2, position: 1 },
    ];

    expect(
      positionsAfterEachRound(withBye, 3, 1, () => everyone).map((point) => point.played)
    ).toEqual([true, false, true]);
  });

  it("does not count a match with no round as playing in any round", () => {
    const noRound = [played(null, 1, 3, 1, 0), played(1, 2, 3, 0, 0), played(2, 1, 2, 0, 0)];
    const everyone = [
      { teamProviderId: 1, position: 1 },
      { teamProviderId: 2, position: 2 },
    ];

    expect(
      positionsAfterEachRound(noRound, 2, 1, () => everyone).map((point) => point.played)
    ).toEqual([false, true]);
  });

  it("refuses a table without the team rather than inventing a position", () => {
    // Unreachable from either provider, since both tables include every team
    // with a match; the throw is what the services turn into an error message.
    expect(() => positionsAfterEachRound([played(1, 99, 2, 0, 0)], 1, 99, tableAfter)).toThrow(
      "Team 99 is missing from the table after round 1"
    );
  });
});

describe("singleTableSeries", () => {
  /**
   * Four teams, three rounds; team 1 climbs from 4th to 1st. After round 2
   * teams 2 and 3 are level on 4 points above team 1's 3 — the kind of table a
   * hand calculation gets wrong, which is why the test below checks every point
   * against `calculateStandings` itself.
   */
  const season = [
    played(1, 2, 1, 2, 0),
    played(1, 3, 4, 1, 0),
    played(2, 1, 4, 3, 0),
    played(2, 2, 3, 0, 0),
    played(3, 1, 3, 2, 0),
    played(3, 4, 2, 1, 0),
  ];

  it("plots the position after every played round", () => {
    const series = singleTableSeries(season, season, 1);

    expect(series).toEqual({
      status: "ok",
      points: [
        { round: 1, position: 4, played: true },
        { round: 2, position: 3, played: true },
        { round: 3, position: 1, played: true },
      ],
      teamCount: 4,
      endsAtSplit: false,
    });
  });

  it("equals the table `calculateStandings` gives after each round — the page's own", () => {
    const series = singleTableSeries(season, season, 1);
    if (series.status !== "ok") throw new Error("expected a series");

    for (const point of series.points) {
      const table = calculateStandings(
        season.filter((match) => (match.matchday ?? 0) <= point.round),
        season
      );
      expect(table.find((row) => row.teamProviderId === 1)?.position).toBe(point.position);
    }
  });

  it("counts every team in the season as the axis extent, including ones yet to play", () => {
    const roster = [...season, played(4, 5, 6, 0, 0)];
    const series = singleTableSeries(season, roster, 1);

    expect(series.status === "ok" && series.teamCount).toBe(6);
  });

  it("ends the line at this team's last played round in a season still in progress", () => {
    // Others have played round 3; team 1's round-3 match is still to come.
    const inProgress = season.filter(
      (match) => !(match.matchday === 3 && match.homeTeamProviderId === 1)
    );
    const series = singleTableSeries(inProgress, season, 1);

    expect(series.status === "ok" && series.points.map((point) => point.round)).toEqual([1, 2]);
  });

  it("marks the round a team has not played yet, while others have", () => {
    // Team 1's round-2 match is still to come, but round 3 has been played by
    // everyone: round 2 is on the line, not played.
    const postponed = season.filter(
      (match) => !(match.matchday === 2 && match.homeTeamProviderId === 1)
    );
    const series = singleTableSeries(postponed, season, 1);

    expect(series.status === "ok" && series.points.map((point) => point.played)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it("reports no rounds for a team that has not played", () => {
    expect(singleTableSeries(season, season, 99)).toEqual({ status: "no-rounds" });
  });
});

describe("teamsInGroupsAbove", () => {
  /** The regular season's final order: team 1 top, team 12 bottom. */
  const regularSeason = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const upper = new Set([1, 2, 3, 4, 5, 6]);
  const lower = new Set([7, 8, 9, 10, 11, 12]);

  it("puts the lower group below every team of the upper one — its leader is 7th", () => {
    expect(teamsInGroupsAbove(lower, [upper, lower], regularSeason)).toBe(6);
  });

  it("puts nobody above the upper group", () => {
    expect(teamsInGroupsAbove(upper, [upper, lower], regularSeason)).toBe(0);
  });

  it("ranks groups by the regular season, not by the order they are given in", () => {
    // The ids — or here, the order — would say the lower group comes first.
    expect(teamsInGroupsAbove(lower, [lower, upper], regularSeason)).toBe(6);
    expect(teamsInGroupsAbove(upper, [lower, upper], regularSeason)).toBe(0);
  });

  it("reads each group's size from the data, not from a constant six", () => {
    const bigUpper = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
    const smallLower = new Set([9, 10, 11, 12]);

    expect(teamsInGroupsAbove(smallLower, [bigUpper, smallLower], regularSeason)).toBe(8);
  });

  it("adds every group above when there are more than two", () => {
    const top = new Set([1, 2, 3, 4]);
    const middle = new Set([5, 6, 7, 8]);
    const bottom = new Set([9, 10, 11, 12]);

    expect(teamsInGroupsAbove(bottom, [top, middle, bottom], regularSeason)).toBe(8);
  });

  it("ranks a group with no team in the regular season last", () => {
    const stranger = new Set([99]);

    expect(teamsInGroupsAbove(stranger, [upper, lower, stranger], regularSeason)).toBe(12);
    expect(teamsInGroupsAbove(lower, [upper, lower, stranger], regularSeason)).toBe(6);
  });
});
