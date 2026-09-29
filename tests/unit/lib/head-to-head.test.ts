import { afterEach, describe, expect, it } from "vitest";
import {
  averageText,
  goalsLabel,
  goalsLine,
  homeLine,
  mostCommonSentence,
  playedLine,
  recordLine,
  shadeLevel,
} from "@/components/head-to-head-page";
import {
  type AnalysedMeeting,
  competitionGroups,
  HEAD_TO_HEAD_LIMIT,
  type HeadToHeadRecord,
  headToHeadRecord,
  headToHeadWindow,
  headToHeadWindowSentence,
  type Meeting,
  meetingsLink,
  meetingsLinkCount,
  SCORE_GRID_CAP,
  type ScoreGrid,
  type SideRecord,
  scoreGrid,
} from "@/lib/head-to-head";
import type { MatchSource } from "@/lib/match-source";

const DOMESTIC: MatchSource = { kind: "taso", bucket: "domestic" };
const NATIONAL: MatchSource = { kind: "taso", bucket: "national" };
const FOREIGN: MatchSource = { kind: "football-data", region: "foreign" };
const NATIONAL_TEAMS: MatchSource = { kind: "football-data", region: "national-teams" };

afterEach(() => {
  process.env.FOOTBALL_DATA_EARLIEST_SEASON = undefined;
});

describe("headToHeadWindowSentence", () => {
  it("states a season window", () => {
    expect(headToHeadWindowSentence({ kind: "season", label: "2023/24" })).toBe(
      "Perustuu kaudesta 2023/24 alkaen tallennettuihin otteluihin."
    );
  });

  it("states a calendar-year window", () => {
    expect(headToHeadWindowSentence({ kind: "year", year: 2018 })).toBe(
      "Perustuu vuodesta 2018 alkaen tallennettuihin otteluihin."
    );
  });
});

describe("headToHeadWindow", () => {
  it("reaches back to the TASO floor for a Finnish club match", () => {
    expect(headToHeadWindow(DOMESTIC, true)).toEqual({
      kind: "season",
      label: "2015",
    });
  });

  it("reaches back to the oldest national-team bucket year", () => {
    // `maajp18` holds matches played in 2018, whatever season it reports.
    expect(headToHeadWindow(NATIONAL, true)).toEqual({
      kind: "year",
      year: 2018,
    });
  });

  it("uses the plan floor for a league, labelled as a spanning season", () => {
    expect(headToHeadWindow(FOREIGN, true)).toEqual({
      kind: "season",
      label: "2023/24",
    });
  });

  it("uses the region's oldest floor, not the match's own competition", () => {
    // A World Cup page can list a 2024 European Championship meeting, because
    // the head-to-head spans the region. Stating the World Cup's own 2026 floor
    // over such a list would describe a window the page has just contradicted.
    expect(headToHeadWindow(NATIONAL_TEAMS, false)).toEqual({
      kind: "season",
      label: "2024",
    });
  });

  it("follows a configured plan floor", () => {
    process.env.FOOTBALL_DATA_EARLIEST_SEASON = "2021";
    expect(headToHeadWindow(FOREIGN, true)).toEqual({
      kind: "season",
      label: "2021/22",
    });
  });
});

describe("HEAD_TO_HEAD_LIMIT", () => {
  it("is five, per #71", () => {
    expect(HEAD_TO_HEAD_LIMIT).toBe(5);
  });
});

describe("headToHeadRecord (specs/042, S9)", () => {
  const HJK = 1;
  const KUPS = 2;

  /** A meeting, named from the home side as a row stores it. */
  function meeting(
    year: number,
    home: number,
    away: number,
    homeGoals: number,
    awayGoals: number
  ): Meeting {
    return {
      kickoffAt: new Date(`${year}-07-12T16:00:00Z`),
      homeTeamProviderId: home,
      awayTeamProviderId: away,
      homeGoals,
      awayGoals,
    };
  }

  /** Four meetings: HJK win and draw at home, KuPS win and HJK win at KuPS. */
  const MEETINGS: Meeting[] = [
    meeting(2025, HJK, KUPS, 2, 1),
    meeting(2024, HJK, KUPS, 0, 0),
    meeting(2023, KUPS, HJK, 3, 1),
    meeting(2020, KUPS, HJK, 0, 2),
  ];

  it("is null when the two have never met", () => {
    // A record of nothing is not a record, and zeroes would render as
    // `0 ottelua, NaN–NaN`.
    expect(headToHeadRecord([], HJK)).toBeNull();
  });

  it("counts the record from the first team's side", () => {
    const record = headToHeadRecord(MEETINGS, HJK);

    expect(record).toMatchObject({ played: 4, wins: 2, draws: 1, losses: 1 });
  });

  it("swaps wins and losses when the other team is named first", () => {
    // The URL's order decides whose record it is, so the same meetings read
    // the other way round.
    const record = headToHeadRecord(MEETINGS, KUPS);

    expect(record).toMatchObject({ played: 4, wins: 1, draws: 1, losses: 2 });
  });

  it("spans the years the meetings cover", () => {
    expect(headToHeadRecord(MEETINGS, HJK)).toMatchObject({ from: 2020, to: 2025 });
  });

  it("reads goals from the first team's own side of each meeting", () => {
    // HJK scored 2 + 0 + 1 + 2, conceded 1 + 0 + 3 + 0.
    expect(headToHeadRecord(MEETINGS, HJK)).toMatchObject({ goalsFor: 5, goalsAgainst: 4 });
  });

  it("mirrors the goals when the other team is named first", () => {
    expect(headToHeadRecord(MEETINGS, KUPS)).toMatchObject({ goalsFor: 4, goalsAgainst: 5 });
  });

  it("reads each ground's line from whoever hosted", () => {
    const record = headToHeadRecord(MEETINGS, HJK);

    // At HJK: won one, drew one. At KuPS: KuPS won one, lost one.
    expect(record?.firstAtHome).toEqual({ wins: 1, draws: 1, losses: 0 });
    expect(record?.secondAtHome).toEqual({ wins: 1, draws: 0, losses: 1 });
  });

  it("accounts for every meeting exactly once across the two grounds", () => {
    const record = headToHeadRecord(MEETINGS, HJK);
    const counted = (side?: SideRecord) =>
      (side?.wins ?? 0) + (side?.draws ?? 0) + (side?.losses ?? 0);

    // The acceptance criterion the summary has to satisfy: the two home lines
    // together are the whole history, neither double-counting nor dropping one.
    expect(counted(record?.firstAtHome) + counted(record?.secondAtHome)).toBe(record?.played);
  });

  it("agrees with itself: the record sums to the matches played", () => {
    const record = headToHeadRecord(MEETINGS, HJK);

    expect((record?.wins ?? 0) + (record?.draws ?? 0) + (record?.losses ?? 0)).toBe(record?.played);
  });

  it("reads a single meeting", () => {
    const record = headToHeadRecord([meeting(2025, KUPS, HJK, 1, 0)], HJK);

    expect(record).toMatchObject({ played: 1, wins: 0, draws: 0, losses: 1, from: 2025, to: 2025 });
    expect(record?.secondAtHome).toEqual({ wins: 1, draws: 0, losses: 0 });
  });
});

describe("the summary's lines (specs/042, S9)", () => {
  const RECORD: HeadToHeadRecord = {
    played: 24,
    from: 1998,
    to: 2025,
    wins: 11,
    draws: 6,
    losses: 7,
    goalsFor: 38,
    goalsAgainst: 31,
    firstAtHome: { wins: 8, draws: 3, losses: 1 },
    secondAtHome: { wins: 3, draws: 3, losses: 6 },
  };

  it("says how many meetings and the years they span", () => {
    expect(playedLine(RECORD)).toBe("24 ottelua, 1998–2025");
  });

  it("names one year when the history is one year deep", () => {
    expect(playedLine({ ...RECORD, played: 1, from: 2025, to: 2025 })).toBe("1 ottelu, 2025");
  });

  it("counts in Finnish, which counts one thing differently", () => {
    // `1 ottelua` is what a hardcoded plural gives, and it is wrong.
    expect(playedLine({ ...RECORD, played: 2, from: 2024, to: 2025 })).toBe("2 ottelua, 2024–2025");
  });

  it("reads the record left to right, first team first", () => {
    expect(recordLine(RECORD, "HJK", "KuPS")).toBe("HJK 11 – 6 tasan – 7 KuPS");
  });

  it("puts the first team's goals first", () => {
    expect(goalsLine(RECORD)).toBe("Maalit 38 – 31");
  });

  it("names each ground by the team that hosts there", () => {
    expect(homeLine("HJK", RECORD.firstAtHome)).toBe("HJK kotona 8 – 3 – 1");
    expect(homeLine("KuPS", RECORD.secondAtHome)).toBe("KuPS kotona 3 – 3 – 6");
  });
});

describe("meetingsLink (specs/042, S10)", () => {
  it("builds the pair's href, in the order it was given them", () => {
    expect(meetingsLink("/kotimaa", 1, 2, 24)).toEqual({
      href: "/kotimaa/kohtaamiset/1/2",
      count: 24,
    });
  });

  it("uses the route's own prefix, so each region links into itself", () => {
    expect(meetingsLink("/maajoukkueet/huuhkajat", 3, 4, 7)?.href).toBe(
      "/maajoukkueet/huuhkajat/kohtaamiset/3/4"
    );
  });

  it("is no link at all when there is nothing behind it", () => {
    expect(meetingsLink("/kotimaa", 1, 2, 0)).toBeNull();
    expect(meetingsLink("/kotimaa", 1, 2, null)).toBeNull();
  });
});

describe("meetingsLinkCount (specs/042, S10)", () => {
  it("is the count when there is a history to open", () => {
    expect(meetingsLinkCount(24)).toBe(24);
  });

  it("is null when the read failed, so no link promises a number", () => {
    expect(meetingsLinkCount(null)).toBeNull();
  });

  it("is null when the pair has nothing to open", () => {
    // The block above already shows everything there is.
    expect(meetingsLinkCount(0)).toBeNull();
  });
});

describe("scoreGrid (specs/044, #337)", () => {
  const HJK = 1;
  const KUPS = 2;

  function meeting(home: number, away: number, homeGoals: number, awayGoals: number): Meeting {
    return {
      kickoffAt: new Date("2025-07-12T16:00:00Z"),
      homeTeamProviderId: home,
      awayTeamProviderId: away,
      homeGoals,
      awayGoals,
    };
  }

  /** The count in the cell for the first team's `first` goals against the second's `second`. */
  function cell(grid: ScoreGrid, first: number, second: number): number | undefined {
    return grid.rows[first]?.cells[second]?.count;
  }

  const total = (grid: ScoreGrid) =>
    grid.rows.reduce((sum, row) => sum + row.cells.reduce((acc, c) => acc + c.count, 0), 0);

  it("counts every meeting from the first team's side, wherever it was played", () => {
    // HJK win 2-1 at home, and 1-2 at KuPS is HJK 2 – KuPS 1 too.
    const grid = scoreGrid([meeting(HJK, KUPS, 2, 1), meeting(KUPS, HJK, 1, 2)], HJK);

    expect(cell(grid, 2, 1)).toBe(2);
    expect(cell(grid, 1, 2)).toBe(0);
    expect(total(grid)).toBe(2);
  });

  it("transposes when the teams are asked for the other way round", () => {
    const meetings = [meeting(HJK, KUPS, 3, 0), meeting(HJK, KUPS, 1, 1)];

    expect(cell(scoreGrid(meetings, HJK), 3, 0)).toBe(1);
    expect(cell(scoreGrid(meetings, KUPS), 0, 3)).toBe(1);
    expect(cell(scoreGrid(meetings, KUPS), 3, 0)).toBe(0);
  });

  it("counts five goals or more under 5+, on either axis", () => {
    const grid = scoreGrid(
      [meeting(HJK, KUPS, 7, 0), meeting(HJK, KUPS, 5, 0), meeting(HJK, KUPS, 1, 6)],
      HJK
    );

    expect(grid.rows).toHaveLength(SCORE_GRID_CAP + 1);
    expect(cell(grid, SCORE_GRID_CAP, 0)).toBe(2);
    expect(cell(grid, 1, SCORE_GRID_CAP)).toBe(1);
    expect(total(grid)).toBe(3);
  });

  it("names the one most common scoreline, uncapped, and how often", () => {
    const grid = scoreGrid(
      [meeting(HJK, KUPS, 7, 0), meeting(KUPS, HJK, 0, 7), meeting(HJK, KUPS, 1, 1)],
      HJK
    );

    expect(grid.mostCommon).toEqual([{ first: 7, second: 0 }]);
    expect(grid.mostCommonCount).toBe(2);
  });

  it("names every scoreline tied for most common, in order of goals", () => {
    const grid = scoreGrid(
      [
        meeting(HJK, KUPS, 2, 1),
        meeting(HJK, KUPS, 1, 1),
        meeting(HJK, KUPS, 2, 1),
        meeting(KUPS, HJK, 1, 1),
        meeting(HJK, KUPS, 0, 3),
      ],
      HJK
    );

    expect(grid.mostCommon).toEqual([
      { first: 1, second: 1 },
      { first: 2, second: 1 },
    ]);
    expect(grid.mostCommonCount).toBe(2);
  });

  it("orders tied scorelines by the second team's goals when the first team's agree", () => {
    const grid = scoreGrid(
      [
        meeting(HJK, KUPS, 1, 2),
        meeting(HJK, KUPS, 1, 1),
        meeting(HJK, KUPS, 1, 2),
        meeting(HJK, KUPS, 1, 1),
      ],
      HJK
    );

    expect(grid.mostCommon).toEqual([
      { first: 1, second: 1 },
      { first: 1, second: 2 },
    ]);
  });

  it("names none when every scoreline occurred once — one meeting included (S8)", () => {
    expect(scoreGrid([meeting(HJK, KUPS, 2, 1), meeting(HJK, KUPS, 1, 0)], HJK).mostCommon).toEqual(
      []
    );
    const once = scoreGrid([meeting(HJK, KUPS, 2, 1)], HJK);
    expect(once.mostCommon).toEqual([]);
    expect(once.mostCommonCount).toBe(0);
  });

  it("scales its shading against the fullest cell", () => {
    const grid = scoreGrid(
      [meeting(HJK, KUPS, 1, 0), meeting(HJK, KUPS, 1, 0), meeting(HJK, KUPS, 0, 0)],
      HJK
    );

    expect(grid.largest).toBe(2);
  });
});

describe("the Tulokset section's text (specs/044)", () => {
  const grid = (mostCommon: ScoreGrid["mostCommon"], mostCommonCount: number): ScoreGrid => ({
    rows: [],
    largest: 0,
    mostCommon,
    mostCommonCount,
  });

  it("says the most common scoreline, first team first", () => {
    expect(mostCommonSentence(grid([{ first: 1, second: 1 }], 6))).toBe(
      "Yleisin tulos 1–1, 6 kertaa."
    );
  });

  it("says kumpikin for two tied scorelines, and kukin for more", () => {
    const two = [
      { first: 1, second: 1 },
      { first: 2, second: 1 },
    ];
    expect(mostCommonSentence(grid(two, 5))).toBe(
      "Yleisimmät tulokset 1–1 ja 2–1, kumpikin 5 kertaa."
    );
    expect(mostCommonSentence(grid([{ first: 0, second: 0 }, ...two], 3))).toBe(
      "Yleisimmät tulokset 0–0, 1–1 ja 2–1, kukin 3 kertaa."
    );
  });

  it("says nothing when there is no most common scoreline (S8)", () => {
    expect(mostCommonSentence(grid([], 0))).toBeNull();
  });

  it("labels the capped axis 5+, and every other goal count as itself", () => {
    expect(goalsLabel(0)).toBe("0");
    expect(goalsLabel(SCORE_GRID_CAP - 1)).toBe("4");
    expect(goalsLabel(SCORE_GRID_CAP)).toBe("5+");
  });

  it("leaves an empty cell unshaded and darkens a cell by its share of the fullest", () => {
    expect(shadeLevel(0, 8)).toBe(0);
    expect(shadeLevel(1, 8)).toBe(1);
    expect(shadeLevel(2, 8)).toBe(1);
    expect(shadeLevel(3, 8)).toBe(2);
    expect(shadeLevel(6, 8)).toBe(3);
    expect(shadeLevel(8, 8)).toBe(4);
  });

  it("never leaves a filled cell unshaded, however small its share", () => {
    // 1 of 9 is under an eighth: rounding would draw it as empty.
    expect(shadeLevel(1, 9)).toBe(1);
  });

  it("prints an average to one decimal with a decimal comma, home first", () => {
    expect(averageText({ home: 2.125, away: 1.4 })).toBe("2,1 – 1,4");
    expect(averageText({ home: 1, away: 0 })).toBe("1,0 – 0,0");
  });
});

describe("competitionGroups (specs/044, #338)", () => {
  function fd(
    code: string,
    label: string,
    seasonId: number,
    homeGoals: number,
    awayGoals: number
  ): AnalysedMeeting {
    return {
      kickoffAt: new Date(`${seasonId}-09-01T16:00:00Z`),
      homeTeamProviderId: 1,
      awayTeamProviderId: 2,
      homeGoals,
      awayGoals,
      competitionKey: code,
      label,
      season: { kind: "football-data", competitionCode: code, seasonId },
    };
  }

  function taso(
    key: string,
    label: string,
    competitionId: string,
    categoryId: string
  ): AnalysedMeeting {
    return {
      kickoffAt: new Date("2025-03-01T12:00:00Z"),
      homeTeamProviderId: 1,
      awayTeamProviderId: 2,
      homeGoals: 1,
      awayGoals: 0,
      competitionKey: key,
      label,
      season: { kind: "taso", competitionId, categoryId },
    };
  }

  it("makes one row per competition, never one blended average (S4)", () => {
    const groups = competitionGroups([
      fd("PL", "Valioliiga", 2024, 3, 1),
      fd("CL", "Mestarien liiga", 2024, 0, 0),
      fd("PL", "Valioliiga", 2023, 1, 0),
    ]);

    expect(groups.map((group) => [group.key, group.played])).toEqual([
      ["PL", 2],
      ["CL", 1],
    ]);
    expect(groups[0]?.average).toEqual({ home: 2, away: 0.5 });
    expect(groups[1]?.average).toEqual({ home: 0, away: 0 });
  });

  it("orders by meetings, then by name", () => {
    const groups = competitionGroups([
      fd("PL", "Valioliiga", 2024, 1, 0),
      fd("EL", "Eurooppa-liiga", 2024, 1, 0),
      fd("CL", "Mestarien liiga", 2024, 1, 0),
      fd("CL", "Mestarien liiga", 2023, 1, 0),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["CL", "EL", "PL"]);
  });

  it("takes the name from the newest meeting, which comes first", () => {
    const [group] = competitionGroups([
      fd("PL", "Valioliiga", 2025, 1, 0),
      fd("PL", "Englannin Valioliiga", 2016, 1, 0),
    ]);

    expect(group?.label).toBe("Valioliiga");
  });

  it("scopes a football-data competition to the seasons the pair met in it (S7)", () => {
    const [group] = competitionGroups([
      fd("PL", "Valioliiga", 2024, 1, 0),
      fd("PL", "Valioliiga", 2016, 1, 0),
      fd("PL", "Valioliiga", 2024, 2, 2),
    ]);

    expect(group?.scope).toEqual({
      kind: "football-data",
      competitionCode: "PL",
      seasonIds: [2016, 2024],
    });
  });

  it("scopes a TASO competition to its exact competition-seasons, across category ids", () => {
    // Liigacup: `LC2023` in 2023, `LC` since — one competition, two seasons.
    const [group] = competitionGroups([
      taso("LC", "Liigacup", "Liigacup25", "LC"),
      taso("LC", "Liigacup", "Liigacup25", "LC"),
      taso("LC", "Liigacup", "Liigacup23", "LC2023"),
    ]);

    expect(group?.played).toBe(3);
    expect(group?.scope).toEqual({
      kind: "taso",
      seasons: [
        { competitionId: "Liigacup25", categoryId: "LC" },
        { competitionId: "Liigacup23", categoryId: "LC2023" },
      ],
    });
  });
});
