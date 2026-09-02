import { afterEach, describe, expect, it } from "vitest";
import { HEAD_TO_HEAD_LIMIT, headToHeadWindow, headToHeadWindowSentence } from "@/lib/head-to-head";
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
    expect(headToHeadWindow(DOMESTIC, { competitionCode: "spljp26" }, true)).toEqual({
      kind: "season",
      label: "2015",
    });
  });

  it("reaches back to the oldest national-team bucket year", () => {
    // `maajp18` holds matches played in 2018, whatever season it reports.
    expect(headToHeadWindow(NATIONAL, { competitionCode: "maajp2026" }, true)).toEqual({
      kind: "year",
      year: 2018,
    });
  });

  it("uses the plan floor for a league, labelled as a spanning season", () => {
    expect(headToHeadWindow(FOREIGN, { competitionCode: "PL" }, true)).toEqual({
      kind: "season",
      label: "2023/24",
    });
  });

  it("uses a tournament's own floor, labelled as a single year", () => {
    // Our plan reaches the 2026 World Cup and nothing earlier.
    expect(headToHeadWindow(NATIONAL_TEAMS, { competitionCode: "WC" }, false)).toEqual({
      kind: "season",
      label: "2026",
    });
  });

  it("follows a configured plan floor", () => {
    process.env.FOOTBALL_DATA_EARLIEST_SEASON = "2021";
    expect(headToHeadWindow(FOREIGN, { competitionCode: "PL" }, true)).toEqual({
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
