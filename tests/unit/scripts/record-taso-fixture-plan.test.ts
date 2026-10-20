import { describe, expect, it } from "vitest";
import {
  buildFixture,
  isProviderMatch,
  isRecorded,
  parseCategoryNames,
  type RecordedFixture,
  refuseStandInSource,
  type Selection,
  type StoredGroupTeam,
  type StoredMatch,
  type StoredZone,
  summariseChanges,
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

describe("the recording's source database", () => {
  it.each(["footy-trends_test", "footy-trends_674_test"])("accepts %s", (name) => {
    expect(() => refuseStandInSource(name)).not.toThrow();
  });

  it.each(["footy-trends_stand_in_3001_test", "footy-trends_674_stand_in_3011_test"])(
    "refuses %s, a stand-in run's database",
    (name) => {
      expect(() => refuseStandInSource(name)).toThrow(
        `${name} is a stand-in run's database; record from the test database`
      );
    }
  );
});

describe("which stored matches came from TASO", () => {
  it.each([
    ["a TASO match id", 3_911_959, true],
    ["the largest id below the e2e specs' range", 998_999_999, true],
    ["the first id the e2e specs seed", 999_000_000, false],
    ["a spec's seeded match", 999_057_001, false],
  ])("counts %s as TASO's: %s", (_case, tasoMatchId, expected) => {
    expect(isProviderMatch({ tasoMatchId })).toBe(expected);
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

  it.each([
    ["a word of its own", "Postponed", "unknown"],
    ["an inherited property's name", "toString", "constructor"],
  ])(
    "passes an unmapped status through and leaves out an unmapped winner: %s",
    (_case, status, winner) => {
      const sent = toProviderMatch({ ...match, status, winner });
      expect(sent.status).toBe(status);
      expect(sent).not.toHaveProperty("winner");
    }
  );
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

  it("sends a group with no zones without levels, its teams in the order given, an unfinished standing as null", () => {
    const groups = toProviderGroups(
      [{ ...team, teamProviderId: 70000, finalGroupStanding: null }, { ...team, groupId: 3 }, team],
      [],
      new Map()
    );
    expect(groups.map((group) => group.group_id)).toEqual(["3", "7"]);
    expect(groups[1]).not.toHaveProperty("next_stage_levels");
    expect(groups[1]?.teams?.map((row) => [row.team_id, row.final_group_standing])).toEqual([
      ["70000", null],
      ["60987", "2"],
    ]);
  });
});

describe("category names read from Redis", () => {
  it("reads a map of names", () => {
    expect(
      parseCategoryNames("taso:categories:spljp22", '{"VL":"Veikkausliiga","M1":"Ykkösliiga"}')
    ).toEqual({
      VL: "Veikkausliiga",
      M1: "Ykkösliiga",
    });
  });

  it("refuses an entry that is not JSON, keeping the parse error as its cause", () => {
    let refusal: unknown;
    try {
      parseCategoryNames("taso:categories:spljp22", "{VL:");
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).toBe(
      "taso:categories:spljp22 in Redis is not a map of category names"
    );
    expect((refusal as Error).cause).toBeInstanceOf(SyntaxError);
  });

  it.each([
    ["null", "null"],
    ["a list", '["Veikkausliiga"]'],
    ["a string", '"Veikkausliiga"'],
    ["a name that is not a string", '{"VL":1}'],
  ])("refuses %s, naming the entry", (_case, raw) => {
    expect(() => parseCategoryNames("taso:categories:spljp22", raw)).toThrow(
      "taso:categories:spljp22 in Redis is not a map of category names"
    );
  });
});

describe("zone levels", () => {
  it.each([0, 11])("refuses a zone at level %s, outside the ten TASO sends", (level) => {
    expect(() => toProviderGroups([], [{ ...zone, level }], new Map())).toThrow(
      `Zone level ${level} of group 7 is outside 1 to 10`
    );
  });

  it("places the first and the tenth level at either end", () => {
    const [group] = toProviderGroups(
      [],
      [
        { ...zone, level: 1, teamCount: 2 },
        { ...zone, level: 10, teamCount: 3 },
      ],
      new Map()
    );
    expect(group?.next_stage_levels).toBe("2,0,0,0,0,0,0,0,0,3");
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
      previousNames: {},
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
      previousNames: {},
    });
    expect(fixture.competitions).toEqual([
      { competition_id: "spljp22", competition_status: "published", season_id: "2022" },
      { competition_id: "spljp25", competition_status: "published", season_id: "2025" },
    ]);
  });

  it("leaves unrecorded the list a category has no stored rows for, matches or groups", () => {
    const fixture = buildFixture({
      matches: [cup],
      groupTeams: [team],
      zones: [{ ...zone, categoryId: "M1" }],
      categoryNames: {},
      previousNames: {},
    });
    expect(fixture.matches).toEqual({ Liigacup26: { LC: [toProviderMatch(cup)] } });
    expect(Object.keys(fixture.groups)).toEqual(["spljp22"]);
    expect(Object.keys(fixture.groups.spljp22 ?? {})).toEqual(["M1", "VL"]);
    expect(fixture.groups.spljp22?.M1?.[0]?.next_stage_levels).toBe("0,6,0,0,0,0,0,0,0,0");
  });

  it("records no names for a competition named after an inherited property", () => {
    const fixture = buildFixture({
      matches: [{ ...match, competitionId: "constructor" }],
      groupTeams: [],
      zones: [],
      categoryNames: {},
      previousNames: {},
    });
    expect(fixture.categories).toEqual({});
  });

  it("keeps the names of a competition whose id is __proto__ as an own key", () => {
    const fixture = buildFixture({
      matches: [{ ...match, competitionId: "__proto__" }],
      groupTeams: [],
      zones: [],
      categoryNames: JSON.parse('{"__proto__": {"VL": "Veikkausliiga"}}'),
      previousNames: {},
    });
    expect(Object.hasOwn(fixture.categories, "__proto__")).toBe(true);
    expect(JSON.parse(JSON.stringify(fixture.categories))).toEqual(
      JSON.parse('{"__proto__": {"VL": "Veikkausliiga"}}')
    );
  });

  it("keeps ids apart however they are spelled, a separator character included", () => {
    const fixture = buildFixture({
      matches: [
        { ...match, competitionId: "a\u0000b", categoryId: "c" },
        { ...match, competitionId: "a", categoryId: "b\u0000c", tasoMatchId: 3002 },
      ],
      groupTeams: [],
      zones: [],
      categoryNames: {},
      previousNames: {},
    });
    expect(Object.keys(fixture.matches).sort()).toEqual(["a", "a\u0000b"]);
    expect(Object.keys(fixture.matches.a ?? {})).toEqual(["b\u0000c"]);
  });

  it("keeps the previous recording's names where Redis no longer holds them, and Redis's where it does", () => {
    const fixture = buildFixture({
      matches: [match, { ...match, competitionId: "spljp21", seasonId: 2021 }],
      groupTeams: [],
      zones: [],
      categoryNames: { spljp22: { VL: "Veikkausliiga" } },
      previousNames: { spljp21: { VL: "Veikkausliiga 2021" }, spljp22: { VL: "vanha" } },
    });
    expect(fixture.categories).toEqual({
      spljp21: { VL: "Veikkausliiga 2021" },
      spljp22: { VL: "Veikkausliiga" },
    });
  });

  it("keeps the previous recording's names when Redis holds an empty set for the same competition", () => {
    const fixture = buildFixture({
      matches: [match],
      groupTeams: [],
      zones: [],
      categoryNames: { spljp22: {} },
      previousNames: { spljp22: { VL: "Veikkausliiga" } },
    });
    expect(fixture.categories).toEqual({ spljp22: { VL: "Veikkausliiga" } });
  });

  it("records no names for a competition whose names are an empty set, from Redis or before", () => {
    const fixture = buildFixture({
      matches: [match, { ...match, competitionId: "spljp21", seasonId: 2021 }],
      groupTeams: [],
      zones: [],
      categoryNames: { spljp22: {} },
      previousNames: { spljp21: {} },
    });
    expect(fixture.categories).toEqual({});
  });

  it("refuses to record no matches at all, so the fixture is not replaced by an empty one", () => {
    expect(() =>
      buildFixture({
        matches: [],
        groupTeams: [team],
        zones: [],
        categoryNames: {},
        previousNames: {},
      })
    ).toThrow("No matches to record; the fixture is left as it is");
  });

  it("refuses a competition id that holds two seasons", () => {
    expect(() =>
      buildFixture({
        matches: [match, { ...match, seasonId: 2023 }],
        groupTeams: [],
        zones: [],
        categoryNames: {},
        previousNames: {},
      })
    ).toThrow("spljp22 holds seasons 2022 and 2023; the stand-in replays one");
  });
});

describe("what a recording changes against the previous one", () => {
  const before: RecordedFixture = {
    competitions: [
      { competition_id: "spljp22", competition_status: "published", season_id: "2022" },
    ],
    categories: { spljp22: { VL: "Veikkausliiga", M1: "Ykkösliiga" } },
    matches: { spljp22: { VL: [{}, {}] }, spljp21: { MSC: [{}] } },
    groups: { spljp22: { VL: [{}] } },
  };

  it("names each list added, removed or recounted, in order", () => {
    const after: RecordedFixture = {
      ...before,
      matches: { spljp22: { VL: [{}, {}, {}] }, spljp16: { VL: [{}] } },
    };
    expect(summariseChanges(before, after)).toEqual([
      "added matches spljp16/VL: 1",
      "removed matches spljp21/MSC: 1",
      "changed matches spljp22/VL: 2 -> 3",
    ]);
  });

  it("names a change in groups, in names, and in the seasons getCompetitions lists", () => {
    const after: RecordedFixture = {
      ...before,
      competitions: [
        { competition_id: "spljp23", competition_status: "published", season_id: "2023" },
      ],
      categories: { spljp22: { VL: "Veikkausliiga" } },
      groups: { spljp22: { VL: [{}, {}] } },
    };
    expect(summariseChanges(before, after)).toEqual([
      "changed groups spljp22/VL: 1 -> 2",
      "changed names spljp22: 2 -> 1",
      "removed season spljp22: 2022",
      "added season spljp23: 2023",
    ]);
  });

  it("names a renamed category and a corrected score, though no size changed", () => {
    const after: RecordedFixture = {
      ...before,
      categories: { spljp22: { VL: "Veikkausliiga", M1: "Ykkönen" } },
      matches: { ...before.matches, spljp22: { VL: [{}, { fs_A: "2" }] } },
    };
    expect(summariseChanges(before, after)).toEqual([
      "changed matches spljp22/VL: 2, contents differ",
      "changed names spljp22: 2, contents differ",
    ]);
  });

  it("names nothing when nothing changed", () => {
    expect(summariseChanges(before, structuredClone(before))).toEqual([]);
  });

  it("lists everything as added when there was no previous recording", () => {
    expect(summariseChanges(null, before)).toEqual([
      "added groups spljp22/VL: 1",
      "added matches spljp21/MSC: 1",
      "added matches spljp22/VL: 2",
      "added names spljp22: 2",
      "added season spljp22: 2022",
    ]);
  });
});
