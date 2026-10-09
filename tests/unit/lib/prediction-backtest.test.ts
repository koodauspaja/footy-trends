import { describe, expect, it } from "vitest";
import { fitPoisson, type PoissonPrediction, predictPoisson, utcDay } from "@/lib/poisson";
import { backtestRows, type FinishedMatch, poissonBacktestRows } from "@/lib/prediction-backtest";

/**
 * The rows a backtest writes.
 *
 * decisions/052-predictions-log.md
 * decisions/051-home-win-baseline.md
 * decisions/055-poisson-goal-model.md
 */

const NOW = new Date("2026-10-03T12:00:00Z");
const day = (n: number) => new Date(Date.UTC(2026, 3, n, 15));

let nextId = 1;
function played(
  n: number,
  home: number,
  away: number,
  overrides: Partial<FinishedMatch> = {}
): FinishedMatch {
  return {
    source: "taso" as const,
    code: "VL",
    seasonId: 2026,
    providerMatchId: nextId++,
    kickoffAt: day(n),
    homeTeam: 1,
    awayTeam: 2,
    homeGoals: home,
    awayGoals: away,
    ...overrides,
  };
}

describe("backtestRows", () => {
  it("predicts each match from the matches strictly before it, as the home-win baseline would have", () => {
    const first = played(1, 2, 0);
    const second = played(2, 1, 1);
    const third = played(3, 0, 1);

    const rows = backtestRows([third, first, second], "home-baseline-v1", NOW);

    expect(rows).toEqual([
      expect.objectContaining({
        providerMatchId: second.providerMatchId,
        homeProbability: 1,
        drawProbability: 0,
        awayProbability: 0,
      }),
      expect.objectContaining({
        providerMatchId: third.providerMatchId,
        homeProbability: 0.5,
        drawProbability: 0.5,
        awayProbability: 0,
      }),
    ]);
  });

  it("gives a competition's first match no row: nothing came before it", () => {
    const first = played(1, 2, 0);

    expect(backtestRows([first], "home-baseline-v1", NOW)).toEqual([]);
  });

  it("does not let matches sharing a kickoff inform each other", () => {
    const opener = played(1, 0, 2);
    const together = [played(5, 3, 0), played(5, 3, 0)];
    const after = played(6, 1, 1);

    const rows = backtestRows([opener, ...together, after], "home-baseline-v1", NOW);

    for (const match of together) {
      expect(rows.find((row) => row.providerMatchId === match.providerMatchId)).toMatchObject({
        homeProbability: 0,
        awayProbability: 1,
      });
    }
    // Both count for the match after them.
    expect(rows.find((row) => row.providerMatchId === after.providerMatchId)).toMatchObject({
      homeProbability: expect.closeTo(2 / 3, 10),
      awayProbability: expect.closeTo(1 / 3, 10),
    });
  });

  it("keeps each competition's history, and each provider's, apart", () => {
    const rows = backtestRows(
      [
        played(1, 2, 0),
        played(2, 0, 1, { code: "M1" }),
        played(3, 0, 1, { code: "M1" }),
        played(3, 1, 0, { source: "football-data", code: "VL" }),
      ],
      "home-baseline-v1",
      NOW
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ competitionCode: "M1", awayProbability: 1 });
  });

  it("counts a level score as a draw — the shoot-out is already out of it", () => {
    const rows = backtestRows([played(1, 1, 1), played(2, 4, 0)], "home-baseline-v1", NOW);

    expect(rows[0]).toMatchObject({ drawProbability: 1 });
  });

  it("writes backtest rows, under the model, against each match's kickoff", () => {
    const later = played(9, 0, 0);
    const [row] = backtestRows([played(8, 1, 0), later], "home-baseline-v1", NOW);

    expect(row).toEqual({
      source: "taso",
      providerMatchId: later.providerMatchId,
      competitionCode: "VL",
      model: "home-baseline-v1",
      kind: "backtest",
      homeProbability: 1,
      drawProbability: 0,
      awayProbability: 0,
      predictedAt: NOW,
      kickoffAt: later.kickoffAt,
    });
  });
});

describe("poissonBacktestRows", () => {
  it("predicts each match from a fit of the strictly earlier days, and writes it as a backtest row", () => {
    const first = played(1, 2, 0);
    const second = played(3, 1, 1, { homeTeam: 2, awayTeam: 1 });
    const third = played(6, 0, 1);

    const rows = poissonBacktestRows([third, first, second], NOW);

    // The first day has nothing before it.
    expect(rows.map((row) => row.providerMatchId)).toEqual([
      second.providerMatchId,
      third.providerMatchId,
    ]);
    const fit = fitPoisson([first, second, third], utcDay(third.kickoffAt));
    const expected = (predictPoisson(fit, "VL", 1, 2) as PoissonPrediction).prediction;
    expect(rows[1]).toEqual({
      source: "taso",
      providerMatchId: third.providerMatchId,
      competitionCode: "VL",
      model: "poisson-v1",
      kind: "backtest",
      homeProbability: expect.closeTo(expected.home, 3),
      drawProbability: expect.closeTo(expected.draw, 3),
      awayProbability: expect.closeTo(expected.away, 3),
      predictedAt: NOW,
      kickoffAt: third.kickoffAt,
    });
    // Team 1 won the first meeting 2–0 and drew away: the favourite at home.
    expect(rows[1]?.homeProbability).toBeGreaterThan(rows[1]?.awayProbability as number);
  });

  it("does not let a later match on the same day inform an earlier one", () => {
    const earlier = played(1, 2, 0);
    const noon = played(4, 1, 0, { kickoffAt: new Date(Date.UTC(2026, 3, 4, 12)) });
    const evening = (homeGoals: number) =>
      played(4, homeGoals, 0, { providerMatchId: 7_001, homeTeam: 2, awayTeam: 1 });

    const [afterNil] = poissonBacktestRows([earlier, noon, evening(0)], NOW);
    const [afterNine] = poissonBacktestRows([earlier, noon, evening(9)], NOW);

    expect(afterNine).toEqual(afterNil);
  });

  it("fits each provider apart: the same team ids never meet", () => {
    const taso = [played(1, 5, 0), played(3, 1, 0)];
    const footballData = [
      played(1, 0, 5, { source: "football-data", code: "PL" }),
      played(3, 1, 0, { source: "football-data", code: "PL" }),
    ];

    const rows = poissonBacktestRows([...taso, ...footballData], NOW);

    expect(rows.map((row) => [row.source, row.competitionCode])).toEqual([
      ["football-data", "PL"],
      ["taso", "VL"],
    ]);
    expect(rows[0]?.homeProbability).toBeLessThan(rows[0]?.awayProbability as number);
    expect(rows[1]?.homeProbability).toBeGreaterThan(rows[1]?.awayProbability as number);
    expect(rows[1]).toEqual(poissonBacktestRows(taso, NOW)[0]);
  });

  it("writes no row for a placeholder side", () => {
    const rows = poissonBacktestRows([played(1, 2, 0), played(3, 1, 0, { awayTeam: 0 })], NOW);

    expect(rows).toEqual([]);
  });
});
