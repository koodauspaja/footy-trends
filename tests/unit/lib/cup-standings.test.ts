import { describe, expect, it } from "vitest";
import { buildCupPhaseStandings, type CupPhaseTable } from "@/lib/cup-standings";

let nextMatchId = 1;

type MatchOptions = {
  stage: string | null;
  group?: string | null;
  home: [number, string];
  away: [number, string];
  score?: [number, number];
  status?: string;
};

function match(options: MatchOptions) {
  return {
    providerMatchId: nextMatchId++,
    competitionCode: "CL",
    seasonId: 2024,
    matchday: 1,
    stage: options.stage,
    groupName: options.group ?? null,
    status: options.status ?? "FINISHED",
    kickoffAt: new Date("2024-09-17T19:00:00Z"),
    homeTeamProviderId: options.home[0],
    homeTeamName: options.home[1],
    awayTeamProviderId: options.away[0],
    awayTeamName: options.away[1],
    homeGoals: options.score?.[0] ?? null,
    awayGoals: options.score?.[1] ?? null,
  };
}

/** Narrows away the index-access undefined that strict mode adds. */
function tableAt(tables: CupPhaseTable[], index: number): CupPhaseTable {
  const table = tables[index];
  if (table === undefined) throw new Error(`expected a table at index ${index}`);
  return table;
}

describe("buildCupPhaseStandings", () => {
  it("builds one table for a league-phase season", () => {
    const tables = buildCupPhaseStandings([
      match({ stage: "LEAGUE_STAGE", home: [1, "A"], away: [2, "B"], score: [2, 0] }),
      match({ stage: "LEAGUE_STAGE", home: [3, "C"], away: [4, "D"], score: [1, 1] }),
    ]);

    expect(tables).toHaveLength(1);
    expect(tableAt(tables, 0).group).toBeNull();
    expect(tableAt(tables, 0).heading).toBe("Liigavaihe");
    expect(tableAt(tables, 0).standings.map((row) => row.teamName)).toEqual(["A", "C", "D", "B"]);
  });

  it("builds one table per group for a group-stage season, sorted by group letter", () => {
    const tables = buildCupPhaseStandings([
      match({
        stage: "GROUP_STAGE",
        group: "GROUP_C",
        home: [5, "E"],
        away: [6, "F"],
        score: [1, 0],
      }),
      match({
        stage: "GROUP_STAGE",
        group: "GROUP_A",
        home: [1, "A"],
        away: [2, "B"],
        score: [3, 0],
      }),
      match({
        stage: "GROUP_STAGE",
        group: "GROUP_B",
        home: [3, "C"],
        away: [4, "D"],
        score: [0, 2],
      }),
    ]);

    expect(tables.map((table) => table.heading)).toEqual(["Lohko A", "Lohko B", "Lohko C"]);
    expect(tables.map((table) => table.group)).toEqual(["GROUP_A", "GROUP_B", "GROUP_C"]);
  });

  it("sorts groups alphabetically rather than by the provider's order", () => {
    const tables = buildCupPhaseStandings([
      match({
        stage: "GROUP_STAGE",
        group: "GROUP_H",
        home: [1, "A"],
        away: [2, "B"],
        score: [1, 0],
      }),
      match({
        stage: "GROUP_STAGE",
        group: "GROUP_A",
        home: [3, "C"],
        away: [4, "D"],
        score: [1, 0],
      }),
    ]);

    expect(tables.map((table) => table.group)).toEqual(["GROUP_A", "GROUP_H"]);
  });

  it("accumulates every match of the same group into one table", () => {
    const tables = buildCupPhaseStandings([
      match({
        stage: "GROUP_STAGE",
        group: "GROUP_A",
        home: [1, "A"],
        away: [2, "B"],
        score: [1, 0],
      }),
      match({
        stage: "GROUP_STAGE",
        group: "GROUP_A",
        home: [2, "B"],
        away: [1, "A"],
        score: [0, 3],
      }),
    ]);

    expect(tables).toHaveLength(1);
    expect(tableAt(tables, 0).standings.map((row) => row.played)).toEqual([2, 2]);
  });

  it("keeps knockout results out of the phase table", () => {
    // B lost the group match, then beat A in the final. The table must show
    // the group result only — one played match each.
    const tables = buildCupPhaseStandings([
      match({ stage: "LEAGUE_STAGE", home: [1, "A"], away: [2, "B"], score: [1, 0] }),
      match({ stage: "FINAL", home: [2, "B"], away: [1, "A"], score: [5, 0] }),
    ]);

    const rows = tableAt(tables, 0).standings;
    expect(rows).toHaveLength(2);
    expect(rows.at(0)).toMatchObject({ teamName: "A", played: 1, points: 3, goalsFor: 1 });
    expect(rows.at(1)).toMatchObject({ teamName: "B", played: 1, points: 0, goalsAgainst: 1 });
  });

  it("lists a team that has only unplayed fixtures, with zero stats", () => {
    const tables = buildCupPhaseStandings([
      match({ stage: "LEAGUE_STAGE", home: [1, "A"], away: [2, "B"], status: "SCHEDULED" }),
    ]);

    expect(tableAt(tables, 0).standings.map((row) => row.played)).toEqual([0, 0]);
  });

  it("produces no table when the season has no table-producing phase", () => {
    expect(
      buildCupPhaseStandings([
        match({ stage: "QUARTER_FINALS", home: [1, "A"], away: [2, "B"], score: [1, 0] }),
      ])
    ).toEqual([]);
  });

  it("produces no table for league matches, which carry no stage", () => {
    expect(
      buildCupPhaseStandings([
        match({ stage: null, home: [1, "A"], away: [2, "B"], score: [1, 0] }),
      ])
    ).toEqual([]);
  });

  it("ignores a group-stage match with no group rather than inventing one", () => {
    const tables = buildCupPhaseStandings([
      match({
        stage: "GROUP_STAGE",
        group: "GROUP_A",
        home: [1, "A"],
        away: [2, "B"],
        score: [1, 0],
      }),
      match({ stage: "GROUP_STAGE", group: null, home: [3, "C"], away: [4, "D"], score: [1, 0] }),
    ]);

    expect(tables).toHaveLength(1);
    expect(tableAt(tables, 0).group).toBe("GROUP_A");
  });
});
