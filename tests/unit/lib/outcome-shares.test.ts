import { describe, expect, it } from "vitest";
import { outcomeShares, roundedAdvantage, type SeasonOutcomes } from "@/lib/outcome-shares";

/**
 * Home wins, draws and away wins as shares of a season.
 *
 * decisions/049-home-advantage-and-draw-rate.md
 */

const FLOOR = 2023;

// A completed season of 100 matches: 45 home wins, 25 draws, 30 away wins.
function season(overrides: Partial<SeasonOutcomes> = {}): SeasonOutcomes {
  return {
    kind: "football-data",
    code: "PL",
    seasonId: 2024,
    matches: 100,
    homeWins: 45,
    draws: 25,
    awayWins: 30,
    leftToPlay: 0,
    spansCalendarYears: true,
    ...overrides,
  };
}

describe("roundedAdvantage", () => {
  it("rounds to whole points, and never prints a negative zero", () => {
    expect(roundedAdvantage(15.6)).toBe(16);
    expect(roundedAdvantage(-2.6)).toBe(-3);
    expect(Object.is(roundedAdvantage(-0.4), 0)).toBe(true);
  });
});

describe("outcomeShares", () => {
  it("turns a competition's counts into shares and Kotietu, named as its list does (S5)", () => {
    const { rows } = outcomeShares(
      [season(), season({ kind: "taso", code: "VL", spansCalendarYears: false })],
      FLOOR
    );

    expect(rows[0]).toEqual({
      kind: "football-data",
      code: "PL",
      name: "Valioliiga",
      matches: 100,
      homeShare: 45,
      drawShare: 25,
      awayShare: 30,
      advantage: 15,
    });
    expect(rows[1]?.name).toBe("Veikkausliiga");
  });

  it("sums a competition's counted seasons into one row", () => {
    const { rows } = outcomeShares(
      [season(), season({ seasonId: 2023, matches: 50, homeWins: 10, draws: 20, awayWins: 20 })],
      FLOOR
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      matches: 150,
      homeShare: (55 / 150) * 100,
      drawShare: (45 / 150) * 100,
      awayShare: (50 / 150) * 100,
    });
  });

  it("computes Kotietu from the unrounded shares (S14)", () => {
    // 1/3 home, 1/3 draw, 1/3 away but for one: shares that round to the same
    // whole numbers, while their difference does not vanish.
    const { rows } = outcomeShares(
      [season({ matches: 300, homeWins: 101, draws: 100, awayWins: 99 })],
      FLOOR
    );

    expect(rows[0]?.advantage).toBeCloseTo(2 / 3);
  });

  it("leaves out a season before the floor (S8)", () => {
    const { rows } = outcomeShares([season(), season({ seasonId: 2022, homeWins: 100 })], FLOOR);

    expect(rows[0]?.matches).toBe(100);
  });

  it("leaves out a season with a match still to play, and one with nothing finished (S19)", () => {
    const { rows } = outcomeShares(
      [
        season(),
        season({ seasonId: 2025, leftToPlay: 1 }),
        season({ code: "BL1", matches: 0, homeWins: 0, draws: 0, awayWins: 0 }),
      ],
      FLOOR
    );

    expect(rows.map((row) => [row.code, row.matches])).toEqual([["PL", 100]]);
  });

  it("orders by Kotietu as printed, strongest first, then more matches (S11, S17)", () => {
    const { rows } = outcomeShares(
      [
        season({ code: "BL1", homeWins: 40, awayWins: 35 }), // +5
        // +15,4, printed +15, over 500 matches.
        season({ code: "SA", matches: 500, homeWins: 227, draws: 123, awayWins: 150 }),
        // Exactly +15 over 1 000: printed the same, so the larger sample goes
        // first, though its unrounded value is the smaller.
        season({ code: "PL", matches: 1000, homeWins: 450, draws: 250, awayWins: 300 }),
        season({ code: "PD", homeWins: 30, awayWins: 45 }), // −15
      ],
      FLOOR
    );

    expect(rows.map((row) => row.code)).toEqual(["PL", "SA", "BL1", "PD"]);
  });

  it("names the seasons of each kind the table covers (S18)", () => {
    const result = outcomeShares(
      [
        // Out of order, as a database may return them.
        season({ seasonId: 2024 }),
        season({ seasonId: 2025 }),
        season({ seasonId: 2023 }),
        season({ kind: "taso", code: "VL", seasonId: 2024, spansCalendarYears: false }),
        // Not counted, so not named.
        season({
          kind: "taso",
          code: "VL",
          seasonId: 2026,
          spansCalendarYears: false,
          leftToPlay: 3,
        }),
      ],
      FLOOR
    );

    expect(result.spanningYears).toEqual({ first: 2023, last: 2025 });
    expect(result.calendarYears).toEqual({ first: 2024, last: 2024 });
  });

  it("names no seasons of a kind with none in the table", () => {
    const result = outcomeShares([season()], FLOOR);

    expect(result.calendarYears).toBeNull();
    expect(outcomeShares([], FLOOR)).toEqual({
      status: "ok",
      rows: [],
      calendarYears: null,
      spanningYears: null,
    });
  });
});
