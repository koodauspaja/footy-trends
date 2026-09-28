import { afterEach, describe, expect, it } from "vitest";
import { goalsLine, homeLine, playedLine, recordLine } from "@/components/head-to-head-page";
import {
  HEAD_TO_HEAD_LIMIT,
  type HeadToHeadRecord,
  headToHeadRecord,
  headToHeadWindow,
  headToHeadWindowSentence,
  type Meeting,
  meetingsLink,
  meetingsLinkCount,
  type SideRecord,
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
