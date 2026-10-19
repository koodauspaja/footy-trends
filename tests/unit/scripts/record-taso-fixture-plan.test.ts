import { describe, expect, it } from "vitest";
import {
  buildFixture,
  isRecorded,
  type Selection,
  type StoredGroupTeam,
  type StoredMatch,
  type StoredZone,
  toProviderGroups,
  toProviderMatch,
} from "../../../scripts/record-taso-fixture-plan";
import {
  normalizeGroupLevels,
  normalizeGroupTeams,
  normalizeTasoMatch,
} from "../../../src/lib/taso";

/**
 * Stored TASO rows turned back into TASO's answers for the e2e stand-in, read
 * back through the app's own normalisers to the same rows.
 *
 * decisions/674-e2e-on-an-empty-database.md
 */

const selection: Selection = {
  earliestSeason: 2015,
  latestSeason: 2026,
  seeded: { competitionId: "spljp17", categoryId: "VL", seasonId: 2017 },
};

const match: StoredMatch = {
  competitionId: "spljp22",
  categoryId: "VL",
  seasonId: 2022,
  tasoMatchId: 3001,
  groupId: 7,
  groupName: "Runkosarja",
  kickoffAt: new Date("2022-04-02T12:00:00.000Z"),
  matchday: 1,
  status: "FINISHED",
  winner: "home",
  homeTeamProviderId: 60987,
  homeTeamName: "FC Inter",
  awayTeamProviderId: 60493,
  awayTeamName: "AC Oulu",
  homeGoals: 2,
  awayGoals: 1,
  halfTimeHome: 1,
  halfTimeAway: 0,
};

const team: StoredGroupTeam = {
  competitionId: "spljp22",
  categoryId: "VL",
  seasonId: 2022,
  groupId: 7,
  teamProviderId: 60987,
  teamName: "FC Inter",
  startingPoints: 3,
  points: 40,
  matchesPlayed: 22,
  matchesWon: 12,
  matchesTied: 4,
  matchesLost: 6,
  goalsFor: 35,
  goalsAgainst: 20,
  goalsDiff: 15,
  currentStanding: 2,
  finalGroupStanding: 2,
};

const zone: StoredZone = {
  competitionId: "spljp22",
  categoryId: "VL",
  seasonId: 2022,
  groupId: 7,
  level: 2,
  teamCount: 6,
  label: "Mestaruussarja",
};

describe("which stored rows are recorded", () => {
  it.each([
    ["a domestic season", { competitionId: "spljp22", categoryId: "VL", seasonId: 2022 }, true],
    [
      "a national-team bucket",
      { competitionId: "maajp2025", categoryId: "UNL", seasonId: 2025 },
      false,
    ],
    [
      "the season the suite seeds",
      { competitionId: "spljp17", categoryId: "VL", seasonId: 2017 },
      false,
    ],
    [
      "another category of the seeded season",
      { competitionId: "spljp17", categoryId: "M1", seasonId: 2017 },
      true,
    ],
    [
      "another season of the seeded category",
      { competitionId: "spljp18", categoryId: "VL", seasonId: 2018 },
      true,
    ],
    [
      "a season before the earliest",
      { competitionId: "spljp14", categoryId: "VL", seasonId: 2014 },
      false,
    ],
    [
      "an integration test's season",
      { competitionId: "spljp99", categoryId: "VL", seasonId: 901102 },
      false,
    ],
    ["the earliest season", { competitionId: "spljp15", categoryId: "VL", seasonId: 2015 }, true],
    ["the latest season", { competitionId: "spljp26", categoryId: "VL", seasonId: 2026 }, true],
  ])("records %s: %s", (_case, row, expected) => {
    expect(isRecorded(row, selection)).toBe(expected);
  });
});

describe("a stored match as TASO sent it", () => {
  it("reads back through normalizeTasoMatch as the row it came from", () => {
    expect(normalizeTasoMatch(toProviderMatch(match), "spljp22", "VL", 2022)).toEqual({
      providerMatchId: 3001,
      competitionCode: "spljp22",
      categoryId: "VL",
      seasonId: 2022,
      groupId: 7,
      groupName: "Runkosarja",
      status: "FINISHED",
      kickoffAt: match.kickoffAt,
      matchday: 1,
      homeTeamProviderId: 60987,
      homeTeamName: "FC Inter",
      awayTeamProviderId: 60493,
      awayTeamName: "AC Oulu",
      homeGoals: 2,
      awayGoals: 1,
      halfTimeHome: 1,
      halfTimeAway: 0,
      winner: "home",
    });
  });

  it("sends an unplayed match as TASO does: a fixture, no winner, no round, empty scores", () => {
    const upcoming = toProviderMatch({
      ...match,
      status: "SCHEDULED",
      winner: null,
      matchday: null,
      homeGoals: null,
      awayGoals: null,
      halfTimeHome: null,
      halfTimeAway: null,
    });
    expect(upcoming).toMatchObject({ status: "Fixture", fs_A: "", fs_B: "", hts_A: "", hts_B: "" });
    expect(upcoming).not.toHaveProperty("winner");
    expect(upcoming).not.toHaveProperty("round_id");
  });

  it.each([
    ["away", "Away"],
    ["tie", "Tie"],
  ])("sends a %s winner as %s", (winner, expected) => {
    expect(toProviderMatch({ ...match, winner }).winner).toBe(expected);
  });

  it("passes a status and a winner it has no word for through as stored, and leaves out the winner", () => {
    const postponed = toProviderMatch({ ...match, status: "Postponed", winner: "unknown" });
    expect(postponed.status).toBe("Postponed");
    expect(postponed).not.toHaveProperty("winner");
  });
});

describe("a category's stored groups as getCategory sent them", () => {
  it("read back through the normalisers as the team rows and zones they came from", () => {
    const groups = toProviderGroups([team], [zone], new Map([[7, "Runkosarja"]]));
    expect(groups[0]).toMatchObject({ group_id: "7", group_name: "Runkosarja" });
    expect(normalizeGroupTeams(groups, "VL", "spljp22", 2022)).toEqual([
      {
        categoryId: "VL",
        competitionCode: "spljp22",
        seasonId: 2022,
        groupId: 7,
        teamProviderId: 60987,
        teamName: "FC Inter",
        startingPoints: 3,
        points: 40,
        played: 22,
        won: 12,
        drawn: 4,
        lost: 6,
        goalsFor: 35,
        goalsAgainst: 20,
        goalDifference: 15,
        currentStanding: 2,
        finalGroupStanding: 2,
      },
    ]);
    expect(normalizeGroupLevels(groups, "VL", "spljp22", 2022)).toEqual([
      {
        categoryId: "VL",
        competitionCode: "spljp22",
        seasonId: 2022,
        groupId: 7,
        level: 2,
        teamCount: 6,
        label: "Mestaruussarja",
      },
    ]);
  });

  it("keeps a group that has only zones, an unlabelled one, and one with no matches unnamed", () => {
    const groups = toProviderGroups([], [{ ...zone, groupId: 9, label: null }], new Map());
    expect(groups).toEqual([
      {
        group_id: "9",
        next_stage_levels: "0,6,0,0,0,0,0,0,0,0",
        next_stage_level_texts: ["", "", "", "", "", "", "", "", "", ""],
        teams: [],
      },
    ]);
  });

  it("sends a group with no zones without levels, its teams in id order, an unfinished standing as null", () => {
    const groups = toProviderGroups(
      [{ ...team, teamProviderId: 70000, finalGroupStanding: null }, { ...team, groupId: 3 }, team],
      [],
      new Map()
    );
    expect(groups.map((group) => group.group_id)).toEqual(["3", "7"]);
    expect(groups[1]).not.toHaveProperty("next_stage_levels");
    expect(groups[1]?.teams?.map((row) => [row.team_id, row.final_group_standing])).toEqual([
      ["60987", "2"],
      ["70000", null],
    ]);
  });
});

describe("the recorded fixture", () => {
  const cup: StoredMatch = {
    ...match,
    competitionId: "Liigacup26",
    categoryId: "LC",
    seasonId: 2026,
    tasoMatchId: 4001,
  };

  it("records each category's matches in id order, its groups, and its season's names", () => {
    const fixture = buildFixture({
      matches: [{ ...match, tasoMatchId: 3002 }, match, cup],
      groupTeams: [team],
      zones: [],
      categoryNames: { spljp22: { VL: "Veikkausliiga" }, spljp21: { VL: "Veikkausliiga" } },
    });
    expect(fixture.matches.spljp22?.VL?.map((row) => row.match_id)).toEqual(["3001", "3002"]);
    expect(fixture.groups.spljp22?.VL?.[0]?.group_name).toBe("Runkosarja");
    expect(fixture.categories).toEqual({ spljp22: { VL: "Veikkausliiga" } });
  });

  it("lists only whole seasons as published competitions, by id", () => {
    const fixture = buildFixture({
      matches: [{ ...match, competitionId: "spljp25", seasonId: 2025 }, match, cup],
      groupTeams: [],
      zones: [],
      categoryNames: {},
    });
    expect(fixture.competitions).toEqual([
      { competition_id: "spljp22", competition_status: "published", season_id: "2022" },
      { competition_id: "spljp25", competition_status: "published", season_id: "2025" },
    ]);
  });

  it("gives a category with group rows and no matches an empty match list, and the other way round", () => {
    const fixture = buildFixture({
      matches: [cup],
      groupTeams: [team],
      zones: [{ ...zone, categoryId: "M1" }],
      categoryNames: {},
    });
    expect(fixture.matches.spljp22).toEqual({ M1: [], VL: [] });
    expect(fixture.groups.Liigacup26).toEqual({ LC: [] });
    expect(fixture.groups.spljp22?.M1?.[0]?.next_stage_levels).toBe("0,6,0,0,0,0,0,0,0,0");
  });

  it("refuses a competition id that holds two seasons", () => {
    expect(() =>
      buildFixture({
        matches: [match, { ...match, seasonId: 2023 }],
        groupTeams: [],
        zones: [],
        categoryNames: {},
      })
    ).toThrow("spljp22 holds seasons 2022 and 2023; the stand-in replays one");
  });
});
