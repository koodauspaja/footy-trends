import { describe, expect, it } from "vitest";
import { comebacksOf, type HalfTimeMatch } from "@/lib/comebacks";

/**
 * Team 1's match on `day`, written from its own side: `half` and `full` are
 * `[own, other]`. `half` is `null` when the provider gave no half-time score.
 * Sides alternate, so a mirror-reading shows up.
 */
function match(day: number, half: [number, number] | null, full: [number, number]): HalfTimeMatch {
  const home = day % 2 === 0;
  const [ownHalf, otherHalf] = half ?? [null, null];
  const [ownFull, otherFull] = full;
  return {
    providerMatchId: day,
    kickoffAt: new Date(`2025-09-${String(day).padStart(2, "0")}T15:00:00Z`),
    homeTeamProviderId: home ? 1 : 9,
    awayTeamProviderId: home ? 9 : 1,
    homeGoals: home ? ownFull : otherFull,
    awayGoals: home ? otherFull : ownFull,
    halfTimeHome: home ? ownHalf : otherHalf,
    halfTimeAway: home ? otherHalf : ownHalf,
  };
}

const NONE = { matches: 0, won: 0, drew: 0, lost: 0 };

describe("comebacksOf", () => {
  it("counts what became of the matches it trailed at half-time", () => {
    const season = [
      match(1, [0, 1], [2, 1]), // behind, won
      match(2, [0, 2], [2, 2]), // behind, drew
      match(3, [0, 1], [0, 3]), // behind, lost anyway
      match(4, [1, 0], [1, 0]), // ahead, won — not a comeback
      match(5, [0, 0], [1, 0]), // level, won — neither direction
    ];

    expect(comebacksOf(season, 1)).toEqual({
      trailed: { matches: 3, won: 1, drew: 1, lost: 1 },
      led: { matches: 1, won: 1, drew: 0, lost: 0 },
      missing: 0,
      known: 5,
    });
  });

  it("counts what became of the matches it led at half-time (specs/037)", () => {
    const season = [
      match(1, [1, 0], [1, 1]), // ahead, drew — a lead given away
      match(2, [2, 0], [2, 3]), // ahead, lost — a lead given away
      match(3, [1, 0], [3, 0]), // ahead, won — not a blown lead
      match(4, [0, 1], [1, 1]), // behind, drew — the other direction
    ];

    expect(comebacksOf(season, 1)).toEqual({
      trailed: { matches: 1, won: 0, drew: 1, lost: 0 },
      led: { matches: 3, won: 1, drew: 1, lost: 1 },
      missing: 0,
      known: 4,
    });
  });

  it("counts a match level at half-time in neither direction", () => {
    // It is still known: the panel's missing line must not claim it.
    const season = [match(1, [0, 0], [2, 1]), match(2, [2, 2], [2, 3])];

    expect(comebacksOf(season, 1)).toEqual({
      trailed: NONE,
      led: NONE,
      missing: 0,
      known: 2,
    });
  });

  it("reads half time from the team's own side, home or away", () => {
    // Every match here is the same story: 0–1 down, 2–1 up. Reading the wrong
    // side would make them leads given away instead.
    const season = [match(1, [0, 1], [2, 1]), match(2, [0, 1], [2, 1])];

    expect(comebacksOf(season, 1)).toMatchObject({
      trailed: { matches: 2, won: 2 },
      led: NONE,
    });
  });

  it("reads a lead from the team's own side too", () => {
    const season = [match(1, [1, 0], [1, 2]), match(2, [1, 0], [1, 2])];

    expect(comebacksOf(season, 1)).toMatchObject({
      led: { matches: 2, lost: 2 },
      trailed: NONE,
    });
  });

  it("counts a match with no half-time score as missing, not as 0–0", () => {
    const season = [match(1, null, [2, 1]), match(2, null, [0, 0]), match(3, [0, 1], [1, 1])];

    expect(comebacksOf(season, 1)).toEqual({
      trailed: { matches: 1, won: 0, drew: 1, lost: 0 },
      led: NONE,
      missing: 2,
      known: 1,
    });
  });

  it("treats a one-sided half-time score as no score at all", () => {
    // Not a shape either provider has produced; a half-score with one side
    // missing still cannot say who was ahead.
    const [broken] = [match(1, [0, 1], [2, 1])];
    const season = [{ ...(broken as HalfTimeMatch), halfTimeAway: null }];

    expect(comebacksOf(season, 1)).toMatchObject({ missing: 1, known: 0, trailed: NONE });
  });

  it("keeps each direction's outcomes adding up to its matches", () => {
    const season = [
      match(1, [0, 1], [2, 1]),
      match(2, [0, 1], [1, 1]),
      match(3, [0, 2], [0, 3]),
      match(4, [1, 0], [1, 1]),
      match(5, [2, 0], [2, 4]),
      match(6, [0, 0], [1, 1]),
      match(7, null, [3, 0]),
    ];
    const { trailed, led, missing, known } = comebacksOf(season, 1);

    for (const [name, side] of [
      ["trailed", trailed],
      ["led", led],
    ] as const) {
      expect(side.won + side.drew + side.lost, name).toBe(side.matches);
    }
    // Strictly less, because match 6 was level at the break.
    expect(trailed.matches + led.matches).toBeLessThan(known);
    expect(known + missing).toBe(season.length);
  });

  it("ignores every other team's matches", () => {
    const others: HalfTimeMatch[] = [
      {
        ...match(9, [0, 1], [2, 1]),
        homeTeamProviderId: 7,
        awayTeamProviderId: 8,
      },
    ];

    expect(comebacksOf([match(1, [0, 1], [2, 1]), ...others], 1)).toMatchObject({
      trailed: { matches: 1 },
      known: 1,
    });
  });

  it("has nothing to report before the first match", () => {
    expect(comebacksOf([], 1)).toEqual({
      trailed: NONE,
      led: NONE,
      missing: 0,
      known: 0,
    });
  });
});
