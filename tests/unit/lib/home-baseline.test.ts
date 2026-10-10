import { describe, expect, it } from "vitest";
import { baselineCompetition, HOME_BASELINE_MODEL, homeBaseline } from "@/lib/home-baseline";
import type { FootballDataMatchRow, StoredMatch, TasoMatchRow } from "@/lib/match-service";
import type { SeasonOutcomes } from "@/lib/outcome-shares";

/**
 * The home-win baseline: its model name, which competitions have one, and the
 * prediction.
 *
 * decisions/051-home-win-baseline.md
 */

function season(overrides: Partial<SeasonOutcomes> = {}): SeasonOutcomes {
  return {
    kind: "taso",
    code: "VL",
    seasonId: 2024,
    matches: 10,
    homeWins: 5,
    draws: 3,
    awayWins: 2,
    leftToPlay: 0,
    spansCalendarYears: false,
    ...overrides,
  };
}

function footballData(overrides: Partial<FootballDataMatchRow> = {}): StoredMatch {
  return {
    source: "football-data",
    match: { competitionCode: "PL", seasonId: 2026, status: "TIMED", ...overrides },
  } as StoredMatch;
}

function taso(overrides: Partial<TasoMatchRow> = {}): StoredMatch {
  return {
    source: "taso",
    match: {
      competitionCode: "spljp26",
      categoryId: "VL",
      seasonId: 2026,
      status: "SCHEDULED",
      ...overrides,
    },
  } as StoredMatch;
}

describe("HOME_BASELINE_MODEL", () => {
  it("names the model and its version for the predictions log", () => {
    expect(HOME_BASELINE_MODEL).toBe("home-baseline-v1");
  });
});

describe("baselineCompetition", () => {
  it("predicts a scheduled or timed match in a compared competition", () => {
    expect(baselineCompetition(footballData())).toEqual({ kind: "football-data", code: "PL" });
    expect(baselineCompetition(footballData({ status: "SCHEDULED" }))).toEqual({
      kind: "football-data",
      code: "PL",
    });
    expect(baselineCompetition(taso())).toEqual({ kind: "taso", code: "VL" });
  });

  it.each([
    "FINISHED",
    "IN_PLAY",
    "PAUSED",
    "LIVE",
    "Live",
    "POSTPONED",
    "SUSPENDED",
    "CANCELLED",
    "AWARDED",
  ])("predicts nothing for a %s match", (status) => {
    expect(baselineCompetition(footballData({ status }))).toBeNull();
    expect(baselineCompetition(taso({ status }))).toBeNull();
  });

  it("predicts nothing in a cup, the World Cup or a national team's match", () => {
    expect(baselineCompetition(footballData({ competitionCode: "WC" }))).toBeNull();
    expect(baselineCompetition(footballData({ competitionCode: "EC" }))).toBeNull();
    expect(baselineCompetition(taso({ categoryId: "MSC" }))).toBeNull();
    expect(
      baselineCompetition(taso({ competitionCode: "Liigacup26", categoryId: "LC" }))
    ).toBeNull();
    // A national-team row: its competition is no domestic season umbrella.
    expect(
      baselineCompetition(taso({ competitionCode: "maajoukkueet26", categoryId: "A" }))
    ).toBeNull();
  });

  it("files a TASO match by its season's exact pair, as its history is counted", () => {
    // Under-21 today, under-20 until 2025: one competition, two eras.
    expect(baselineCompetition(taso({ categoryId: "P21SM" }))).toEqual({
      kind: "taso",
      code: "P21SM",
    });
    expect(
      baselineCompetition(taso({ competitionCode: "spljp25", categoryId: "P20SM", seasonId: 2025 }))
    ).toEqual({ kind: "taso", code: "P21SM" });
    // The old id in the new era belongs to no competition.
    expect(baselineCompetition(taso({ categoryId: "P20SM" }))).toBeNull();
  });
});

describe("homeBaseline", () => {
  it("sums every season into three shares of the finished matches", () => {
    const result = homeBaseline([
      season({ seasonId: 2015, matches: 10, homeWins: 5, draws: 3, awayWins: 2 }),
      season({ seasonId: 2026, matches: 30, homeWins: 12, draws: 9, awayWins: 9, leftToPlay: 6 }),
    ]);

    expect(result).toEqual({
      status: "ok",
      matches: 40,
      homeShare: expect.closeTo(42.5),
      drawShare: expect.closeTo(30),
      awayShare: expect.closeTo(27.5),
      seasons: { first: 2015, last: 2026 },
      spansCalendarYears: false,
    });
  });

  it("counts the season in progress, matches still to play and all", () => {
    const result = homeBaseline([season({ seasonId: 2026, leftToPlay: 120 })]);

    expect(result).toMatchObject({
      status: "ok",
      matches: 10,
      seasons: { first: 2026, last: 2026 },
    });
  });

  it("leaves a season with no finished match out of the count and the range", () => {
    const result = homeBaseline([
      season({ seasonId: 2025 }),
      season({ seasonId: 2027, matches: 0, homeWins: 0, draws: 0, awayWins: 0, leftToPlay: 180 }),
    ]);

    expect(result).toMatchObject({ matches: 10, seasons: { first: 2025, last: 2025 } });
  });

  it("keeps the shares unrounded", () => {
    const result = homeBaseline([season({ matches: 3, homeWins: 1, draws: 1, awayWins: 1 })]);

    const third = expect.closeTo(100 / 3, 10);
    expect(result).toMatchObject({ homeShare: third, drawShare: third, awayShare: third });
  });

  it("says a competition's seasons span two years when any of them does", () => {
    const result = homeBaseline([
      season({ kind: "football-data", code: "PL", seasonId: 2023, spansCalendarYears: true }),
      season({ kind: "football-data", code: "PL", seasonId: 2026, spansCalendarYears: false }),
    ]);

    expect(result).toMatchObject({ spansCalendarYears: true });
  });

  it("is empty with no finished match, and a percentage from the first one", () => {
    expect(homeBaseline([])).toEqual({ status: "empty" });
    expect(
      homeBaseline([season({ matches: 0, homeWins: 0, draws: 0, awayWins: 0, leftToPlay: 90 })])
    ).toEqual({ status: "empty" });
    expect(
      homeBaseline([season({ matches: 1, homeWins: 0, draws: 1, awayWins: 0 })])
    ).toMatchObject({ status: "ok", matches: 1, drawShare: 100 });
  });
});
