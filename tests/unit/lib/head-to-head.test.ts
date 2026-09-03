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
