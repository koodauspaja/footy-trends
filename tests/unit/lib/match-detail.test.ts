import { describe, expect, it } from "vitest";
import {
  declaredWinnerSide,
  formatKickoff,
  formatScore,
  hasPlaceholderTeam,
  isPlaceholderTeam,
  matchContextLines,
  teamDisplayName,
  UNKNOWN_TEAM_NAME,
} from "@/lib/match-detail";

const teams = {
  homeTeamProviderId: 60901,
  homeTeamName: "VPS",
  awayTeamProviderId: 60969,
  awayTeamName: "FC Lahti",
};

describe("formatScore", () => {
  it("shows a played match's score", () => {
    expect(formatScore({ homeGoals: 2, awayGoals: 1 })).toBe("2–1");
  });

  it("shows a dash for a match that has not been played", () => {
    expect(formatScore({ homeGoals: null, awayGoals: null })).toBe("–");
  });

  it("excludes the shootout from the score and states it separately", () => {
    // The provider's fullTime is 2–1 *including* the shootout — printing it raw
    // would claim a score that was never played.
    expect(
      formatScore({
        homeGoals: 2,
        awayGoals: 1,
        regularTimeHome: 1,
        regularTimeAway: 1,
        extraTimeHome: 0,
        extraTimeAway: 0,
        penaltiesHome: 4,
        penaltiesAway: 3,
      })
    ).toBe("1–1 (rp 4–3)");
  });

  it("marks a tie decided in extra time", () => {
    expect(
      formatScore({
        homeGoals: 2,
        awayGoals: 1,
        regularTimeHome: 1,
        regularTimeAway: 1,
        extraTimeHome: 1,
        extraTimeAway: 0,
        penaltiesHome: null,
        penaltiesAway: null,
      })
    ).toBe("2–1 (ja)");
  });

  it("adds no suffix to a match with no breakdown", () => {
    expect(
      formatScore({
        homeGoals: 3,
        awayGoals: 0,
        regularTimeHome: null,
        regularTimeAway: null,
        extraTimeHome: null,
        extraTimeAway: null,
        penaltiesHome: null,
        penaltiesAway: null,
      })
    ).toBe("3–0");
  });
});

describe("declaredWinnerSide", () => {
  it("names TASO's winner when the score is level", () => {
    // TASO never itemises the shootout, so the score alone leaves the tie drawn.
    expect(declaredWinnerSide({ homeGoals: 1, awayGoals: 1 }, "home")).toBe("home");
    expect(declaredWinnerSide({ homeGoals: 0, awayGoals: 0 }, "away")).toBe("away");
  });

  it("says nothing when the score already names the winner", () => {
    expect(declaredWinnerSide({ homeGoals: 2, awayGoals: 1 }, "home")).toBeNull();
  });

  it("says nothing for a tie, a missing verdict or an unplayed match", () => {
    expect(declaredWinnerSide({ homeGoals: 1, awayGoals: 1 }, "tie")).toBeNull();
    expect(declaredWinnerSide({ homeGoals: 1, awayGoals: 1 }, null)).toBeNull();
    expect(declaredWinnerSide({ homeGoals: null, awayGoals: null }, "home")).toBeNull();
  });
});

describe("placeholder teams", () => {
  it("treats TASO's unresolved bracket slot as a placeholder", () => {
    expect(isPlaceholderTeam(0, "")).toBe(true);
    expect(isPlaceholderTeam(0, "Lohko A syksy/1")).toBe(true);
    expect(isPlaceholderTeam(60901, "   ")).toBe(true);
  });

  it("treats a real team as a real team", () => {
    expect(isPlaceholderTeam(60901, "VPS")).toBe(false);
    expect(hasPlaceholderTeam(teams)).toBe(false);
  });

  it("detects a placeholder on either side", () => {
    expect(hasPlaceholderTeam({ ...teams, homeTeamProviderId: 0, homeTeamName: "" })).toBe(true);
    expect(hasPlaceholderTeam({ ...teams, awayTeamProviderId: 0, awayTeamName: "" })).toBe(true);
  });

  it("renders a placeholder under a Finnish name rather than an empty string", () => {
    expect(teamDisplayName(0, "")).toBe(UNKNOWN_TEAM_NAME);
    expect(teamDisplayName(60901, "VPS")).toBe("VPS");
  });
});

describe("formatKickoff", () => {
  it("shows the date and the time in Helsinki", () => {
    // 16:00 UTC in August is 19:00 in Helsinki.
    expect(formatKickoff(new Date("2026-08-31T16:00:00Z"))).toBe("31.08.2026 klo 19.00");
  });

  it("uses Helsinki's winter offset in winter", () => {
    expect(formatKickoff(new Date("2026-11-15T17:30:00Z"))).toBe("15.11.2026 klo 19.30");
  });
});

describe("matchContextLines", () => {
  it("lists the competition, stage, group and round in that order", () => {
    expect(
      matchContextLines({
        source: "football-data",
        competitionLabel: "Mestarien liiga 2025/26",
        matchday: 3,
        stage: "GROUP_STAGE",
        groupName: "GROUP_A",
      })
    ).toEqual(["Mestarien liiga 2025/26", "Lohkovaihe", "Lohko A", "Kierros 3"]);
  });

  it("says nothing for a league season, which is the absence of a stage", () => {
    // Every football-data league row carries REGULAR_SEASON; it is a provider
    // token, not a phase a reader needs named.
    expect(
      matchContextLines({
        source: "football-data",
        competitionLabel: "Valioliiga 2026/27",
        matchday: 2,
        stage: "REGULAR_SEASON",
        groupName: null,
      })
    ).toEqual(["Valioliiga 2026/27", "Kierros 2"]);
  });

  it("numbers a two-legged knockout match as a leg, not a round", () => {
    expect(
      matchContextLines({
        source: "football-data",
        competitionLabel: "Mestarien liiga 2024/25",
        matchday: 2,
        stage: "QUARTER_FINALS",
        groupName: null,
      })
    ).toEqual(["Mestarien liiga 2024/25", "Puolivälierät", "Osaottelu 2"]);
  });

  it("drops a knockout number that is neither leg 1 nor leg 2", () => {
    // The Euro's group counter runs on into the knockout: 4–7, not legs.
    expect(
      matchContextLines({
        source: "football-data",
        competitionLabel: "EM-kisat 2024",
        matchday: 5,
        stage: "QUARTER_FINALS",
        groupName: null,
      })
    ).toEqual(["EM-kisat 2024", "Puolivälierät"]);
  });

  it("omits a line the row has no value for rather than rendering it empty", () => {
    expect(
      matchContextLines({
        source: "football-data",
        competitionLabel: "Valioliiga 2026/27",
        matchday: null,
        stage: null,
        groupName: null,
      })
    ).toEqual(["Valioliiga 2026/27"]);
  });

  it("shows TASO's series name and its round", () => {
    expect(
      matchContextLines({
        source: "taso",
        competitionLabel: null,
        matchday: 6,
        seriesName: "C-liiga lohko 1",
        isCup: false,
      })
    ).toEqual(["C-liiga lohko 1", "Kierros 6"]);
  });

  it("shows no series line for a row whose group name is blank", () => {
    expect(
      matchContextLines({
        source: "taso",
        competitionLabel: "Veikkausliiga 2026",
        matchday: 4,
        seriesName: "",
        isCup: false,
      })
    ).toEqual(["Veikkausliiga 2026", "Kierros 4"]);
  });

  it("drops a Finnish cup's round, which the series name already names", () => {
    // TASO's round_id is not re-indexed per competition — round 63 exists.
    expect(
      matchContextLines({
        source: "taso",
        competitionLabel: "Miesten Suomen Cup 2017",
        matchday: 63,
        seriesName: "Kierros 2",
        isCup: true,
      })
    ).toEqual(["Miesten Suomen Cup 2017", "Kierros 2"]);
  });
});
