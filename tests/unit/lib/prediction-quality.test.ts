import { describe, expect, it } from "vitest";
import {
  brierOf,
  CALIBRATION_MINIMUM,
  calibrationOf,
  commonMatches,
  type JudgedPrediction,
  LOG_LOSS_FLOOR,
  logLossOf,
  pickOf,
  qualityReport,
  ROLLING_POINTS,
  ROLLING_WINDOW,
  rollingOf,
} from "@/lib/prediction-quality";

/**
 * How a prediction is judged: the pick, Brier score, log-loss and calibration.
 *
 * decisions/054-prediction-quality.md
 */

const day = (n: number) => new Date(Date.UTC(2024, 0, 1) + n * 86_400_000);

function judged(overrides: Partial<JudgedPrediction> = {}): JudgedPrediction {
  return {
    model: "a",
    providerMatchId: 1,
    seasonId: 2024,
    kickoffAt: day(0),
    home: 0.5,
    draw: 0.3,
    away: 0.2,
    outcome: "home",
    ...overrides,
  };
}

describe("the constants (S6–S8)", () => {
  it("roll over 200, leave off bins under 50, floor log-loss at 0,001", () => {
    expect({ ROLLING_WINDOW, CALIBRATION_MINIMUM, LOG_LOSS_FLOOR, ROLLING_POINTS }).toEqual({
      ROLLING_WINDOW: 200,
      CALIBRATION_MINIMUM: 50,
      LOG_LOSS_FLOOR: 0.001,
      ROLLING_POINTS: 400,
    });
  });
});

describe("pickOf (S5)", () => {
  it("picks the most likely outcome", () => {
    expect(pickOf({ home: 0.5, draw: 0.3, away: 0.2 })).toBe("home");
    expect(pickOf({ home: 0.2, draw: 0.5, away: 0.3 })).toBe("draw");
    expect(pickOf({ home: 0.2, draw: 0.3, away: 0.5 })).toBe("away");
  });

  it("breaks a tie towards home, then draw", () => {
    expect(pickOf({ home: 0.4, draw: 0.4, away: 0.2 })).toBe("home");
    expect(pickOf({ home: 0.4, draw: 0.2, away: 0.4 })).toBe("home");
    expect(pickOf({ home: 0.2, draw: 0.4, away: 0.4 })).toBe("draw");
  });
});

describe("brierOf and logLossOf (S7)", () => {
  it("scores by hand", () => {
    // (0,5 − 1)² + 0,3² + 0,2² = 0,38
    expect(brierOf(judged())).toBeCloseTo(0.38, 12);
    expect(logLossOf(judged())).toBeCloseTo(-Math.log(0.5), 12);
  });

  it("is 0 for a certain hit and 2 for a certain miss", () => {
    expect(brierOf(judged({ home: 1, draw: 0, away: 0 }))).toBe(0);
    expect(brierOf(judged({ home: 0, draw: 0, away: 1 }))).toBe(2);
  });

  it("floors log-loss's probability at 0,001", () => {
    expect(logLossOf(judged({ home: 0, draw: 0, away: 1 }))).toBeCloseTo(-Math.log(0.001), 12);
  });
});

describe("commonMatches (S4)", () => {
  it("keeps only the matches every model predicted", () => {
    const rows = [
      judged({ model: "a", providerMatchId: 1 }),
      judged({ model: "b", providerMatchId: 1 }),
      judged({ model: "a", providerMatchId: 2 }),
    ];

    expect(commonMatches(rows, ["a", "b"]).map((row) => row.providerMatchId)).toEqual([1, 1]);
  });
});

describe("rollingOf (S6)", () => {
  const series = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      judged({
        providerMatchId: index,
        kickoffAt: day(index),
        outcome: index < 100 ? "home" : "away",
      })
    );

  it("gives nothing under 200 matches", () => {
    expect(rollingOf(series(199))).toEqual([]);
  });

  it("is the share right over each 200, dated by the latest", () => {
    const points = rollingOf(series(201));

    expect(points).toEqual([
      { at: day(199).getTime(), accuracy: 50 },
      { at: day(200).getTime(), accuracy: expect.closeTo(49.5, 12) },
    ]);
  });

  it("thins to at most 400 points, plus the last when the step skips it", () => {
    // 1 802 windows, every fifth kept: the last (the 1 802nd) is off the step.
    const points = rollingOf(series(2001));

    expect(points).toHaveLength(Math.ceil(1802 / 5) + 1);
    expect(points.at(-1)?.at).toBe(day(2000).getTime());
    expect(points.at(-2)?.at).toBe(day(1999).getTime());
    expect(points[0]?.at).toBe(day(199).getTime());
  });

  it("keeps every other window of 401, the step rounding up", () => {
    // 600 matches are 401 windows: one each would be 401 points, over 400.
    const points = rollingOf(series(600));

    expect(points).toHaveLength(201);
    expect(points.length).toBeLessThanOrEqual(ROLLING_POINTS);
  });
});

describe("calibrationOf (S8)", () => {
  it("bins every probability by tens, counting how often its outcome happened", () => {
    const rows = Array.from({ length: 60 }, (_, index) =>
      judged({
        providerMatchId: index,
        home: 0.55,
        draw: 0.25,
        away: 0.2,
        outcome: index < 30 ? "home" : "draw",
      })
    );

    const bins = calibrationOf(rows);

    expect(bins[5]).toEqual({ from: 50, probabilities: 60, observed: 50 });
    expect(bins[2]).toEqual({ from: 20, probabilities: 120, observed: 25 });
  });

  it("shows a bin of exactly 50", () => {
    const rows = Array.from({ length: 50 }, (_, index) =>
      judged({ providerMatchId: index, home: 0.55, draw: 0.25, away: 0.2 })
    );

    expect(calibrationOf(rows)[5]).toEqual({ from: 50, probabilities: 50, observed: 100 });
  });

  it("leaves a bin under 50 off, and puts a probability of 1 in the last", () => {
    const bins = calibrationOf([judged({ home: 1, draw: 0, away: 0 })]);

    expect(bins[9]).toEqual({ from: 90, probabilities: 1, observed: null });
    expect(bins[0]).toEqual({ from: 0, probabilities: 2, observed: null });
  });
});

describe("qualityReport", () => {
  const pair = (id: number, outcome: JudgedPrediction["outcome"], seasonId = 2024) => [
    judged({ model: "a", providerMatchId: id, kickoffAt: day(id), seasonId, outcome }),
    judged({
      model: "b",
      providerMatchId: id,
      kickoffAt: day(id),
      seasonId,
      home: 0.2,
      draw: 0.3,
      away: 0.5,
      outcome,
    }),
  ];

  it("is empty with no match both models predicted", () => {
    expect(qualityReport([judged({ model: "a" })], ["a", "b"])).toEqual({ status: "empty" });
  });

  it("judges each model on the same matches: totals, seasons, years", () => {
    const report = qualityReport(
      [
        ...pair(1, "home", 2023),
        ...pair(400, "away", 2024),
        judged({ model: "a", providerMatchId: 9 }),
      ],
      ["a", "b"]
    );

    expect(report).toMatchObject({
      status: "ok",
      models: ["a", "b"],
      matches: 2,
      firstYear: 2024,
      lastYear: 2025,
      rolling: null,
      binsOmitted: true,
    });
    if (report.status !== "ok") return;
    expect(report.totals.map((total) => [total.model, total.accuracy])).toEqual([
      ["a", 50],
      ["b", 50],
    ]);
    expect(report.seasons).toEqual([
      { seasonId: 2023, matches: 1, brier: [expect.closeTo(0.38, 12), expect.closeTo(0.98, 12)] },
      { seasonId: 2024, matches: 1, brier: [expect.closeTo(0.98, 12), expect.closeTo(0.38, 12)] },
    ]);
    expect(report.calibration.map((line) => [line.model, line.bins.length])).toEqual([
      ["a", 10],
      ["b", 10],
    ]);
  });

  it("orders by kickoff, and a shared kickoff by match id, whatever order the rows come in", () => {
    // 201 matches at one kickoff, given newest id first; only match 0 is missed.
    const rows = Array.from({ length: 201 }, (_, index) => 200 - index).flatMap((id) =>
      pair(id, "home").map((row) => ({
        ...row,
        kickoffAt: day(0),
        outcome: id === 0 ? ("draw" as const) : ("home" as const),
      }))
    );

    const report = qualityReport(rows, ["a", "b"]);

    if (report.status !== "ok") throw new Error("expected a report");
    expect(report.rolling?.[0]?.points.map((point) => point.accuracy)).toEqual([
      expect.closeTo(99.5, 12),
      100,
    ]);
  });

  it("reads the window's years by kickoff, not by the order given", () => {
    const report = qualityReport([...pair(400, "home"), ...pair(1, "home")], ["a", "b"]);

    expect(report).toMatchObject({ firstYear: 2024, lastYear: 2025 });
  });

  it("draws the rolling line once 200 matches are judged", () => {
    const rows = Array.from({ length: 200 }, (_, index) => pair(index, "home")).flat();

    const report = qualityReport(rows, ["a", "b"]);

    expect(
      report.status === "ok"
        ? report.rolling?.map((line) => [line.model, line.points.length])
        : null
    ).toEqual([
      ["a", 1],
      ["b", 1],
    ]);
  });
});
