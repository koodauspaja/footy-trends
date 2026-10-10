import { describe, expect, it } from "vitest";
import {
  isFirstStoredSeason,
  type PredictedMatch,
  SURPRISE_LIMIT,
  seasonSurprises,
  surpriseOf,
} from "@/lib/surprise";

/**
 * The surprise rules: which probability a result reads, that a draw has none,
 * the ranking and its ten, and the first stored season.
 *
 * decisions/057-surprise-index.md
 */

function match(overrides: Partial<PredictedMatch> = {}): PredictedMatch {
  return {
    providerMatchId: 1,
    kickoffAt: new Date("2026-04-04T14:00:00Z"),
    homeTeamProviderId: 10,
    homeTeamName: "Ilves",
    awayTeamProviderId: 20,
    awayTeamName: "HJK",
    homeGoals: 3,
    awayGoals: 0,
    home: 0.3,
    draw: 0.25,
    away: 0.45,
    ...overrides,
  };
}

describe("surpriseOf", () => {
  it("reads the home probability for a home win", () => {
    expect(surpriseOf(match({ homeGoals: 2, awayGoals: 1 }))).toBe(0.3);
  });

  it("reads the away probability for an away win", () => {
    expect(surpriseOf(match({ homeGoals: 0, awayGoals: 1 }))).toBe(0.45);
  });

  it("has no figure for a draw", () => {
    expect(surpriseOf(match({ homeGoals: 1, awayGoals: 1 }))).toBeNull();
  });
});

describe("isFirstStoredSeason", () => {
  it("is the season the stored history starts with, or one before it", () => {
    expect(isFirstStoredSeason(2023, 2023)).toBe(true);
    expect(isFirstStoredSeason(2022, 2023)).toBe(true);
  });

  it("is not a later season, nor any season of a competition with nothing stored", () => {
    expect(isFirstStoredSeason(2024, 2023)).toBe(false);
    expect(isFirstStoredSeason(2024, null)).toBe(false);
  });
});

describe("seasonSurprises", () => {
  it("lists the least likely result first", () => {
    const result = seasonSurprises(
      [
        match({ providerMatchId: 1, home: 0.4 }),
        match({ providerMatchId: 2, home: 0.1 }),
        match({ providerMatchId: 3, homeGoals: 0, awayGoals: 2, away: 0.2 }),
      ],
      false
    );

    expect(result).toMatchObject({ status: "ok", inProgress: false });
    expect(result.status === "ok" && result.surprises.map((s) => s.providerMatchId)).toEqual([
      2, 3, 1,
    ]);
    expect(result.status === "ok" && result.surprises.map((s) => s.probability)).toEqual([
      0.1, 0.2, 0.4,
    ]);
  });

  it("keeps ten, the most surprising ones", () => {
    const matches = Array.from({ length: 12 }, (_, index) =>
      match({ providerMatchId: index + 1, home: (12 - index) / 100 })
    );

    const result = seasonSurprises(matches, false);

    expect(SURPRISE_LIMIT).toBe(10);
    expect(result.status === "ok" && result.surprises.map((s) => s.providerMatchId)).toEqual([
      12, 11, 10, 9, 8, 7, 6, 5, 4, 3,
    ]);
  });

  it("lists the earlier kickoff first among equally surprising matches, then the lower id", () => {
    const later = new Date("2026-05-01T14:00:00Z");
    const result = seasonSurprises(
      [
        match({ providerMatchId: 7, kickoffAt: later }),
        match({ providerMatchId: 9 }),
        match({ providerMatchId: 8 }),
      ],
      false
    );

    expect(result.status === "ok" && result.surprises.map((s) => s.providerMatchId)).toEqual([
      8, 9, 7,
    ]);
  });

  it("leaves a draw out, however unlikely Elo thought it", () => {
    const result = seasonSurprises(
      [
        match({ providerMatchId: 1, homeGoals: 1, awayGoals: 1, draw: 0.01 }),
        match({ providerMatchId: 2 }),
      ],
      false
    );

    expect(result.status === "ok" && result.surprises.map((s) => s.providerMatchId)).toEqual([2]);
  });

  it("lists fewer than ten when the season has fewer", () => {
    const result = seasonSurprises([match()], true);

    expect(result).toMatchObject({ status: "ok", inProgress: true });
    expect(result.status === "ok" && result.surprises).toHaveLength(1);
  });

  it("says so when every predicted match was drawn", () => {
    expect(seasonSurprises([match({ homeGoals: 0, awayGoals: 0 })], true)).toEqual({
      status: "all-drawn",
    });
  });

  it("says so when the season has no predicted match", () => {
    expect(seasonSurprises([], true)).toEqual({ status: "empty" });
  });
});
