import { describe, expect, it } from "vitest";
import {
  brierOf,
  CALIBRATION_MINIMUM,
  calibrationOf,
  commonMatches,
  competitionsOf,
  inCompetition,
  type JudgedPrediction,
  LOG_LOSS_FLOOR,
  logLossOf,
  lowestOf,
  pickOf,
  qualityReport,
  ROLLING_POINTS,
  ROLLING_WINDOW,
  rollingOf,
  SCORE_DECIMALS,
} from "@/lib/prediction-quality";

/**
 * How a prediction is judged: the pick, Brier score, log-loss and calibration,
 * over a provider's matches and competition by competition.
 *
 * decisions/054-prediction-quality.md
 * decisions/056-accuracy-by-competition.md
 */

const day = (n: number) => new Date(Date.UTC(2024, 0, 1) + n * 86_400_000);

function judged(overrides: Partial<JudgedPrediction> = {}): JudgedPrediction {
  return {
    model: "a",
    providerMatchId: 1,
    competitionCode: "VL",
    seasonId: 2024,
    kickoffAt: day(0),
    home: 0.5,
    draw: 0.3,
    away: 0.2,
    outcome: "home",
    ...overrides,
  };
}

describe("the constants", () => {
  it("roll over 200, leave off bins under 50, floor log-loss at 0,001, score to three decimals", () => {
    expect({
      ROLLING_WINDOW,
      CALIBRATION_MINIMUM,
      LOG_LOSS_FLOOR,
      ROLLING_POINTS,
      SCORE_DECIMALS,
    }).toEqual({
      ROLLING_WINDOW: 200,
      CALIBRATION_MINIMUM: 50,
      LOG_LOSS_FLOOR: 0.001,
      ROLLING_POINTS: 400,
      SCORE_DECIMALS: 3,
    });
  });
});

describe("pickOf", () => {
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

describe("brierOf and logLossOf", () => {
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

describe("commonMatches", () => {
  it("keeps only the matches every model predicted", () => {
    const rows = [
      judged({ model: "a", providerMatchId: 1 }),
      judged({ model: "b", providerMatchId: 1 }),
      judged({ model: "a", providerMatchId: 2 }),
    ];

    expect(commonMatches(rows, ["a", "b"]).map((row) => row.providerMatchId)).toEqual([1, 1]);
  });
});

describe("rollingOf", () => {
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

describe("calibrationOf", () => {
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
    expect(qualityReport([judged({ model: "a" })], ["a", "b"], ["VL"])).toEqual({
      status: "empty",
    });
  });

  it("judges each model on the same matches: totals, seasons, years", () => {
    const report = qualityReport(
      [
        ...pair(1, "home", 2023),
        ...pair(400, "away", 2024),
        judged({ model: "a", providerMatchId: 9 }),
      ],
      ["a", "b"],
      ["VL"]
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

    const report = qualityReport(rows, ["a", "b"], ["VL"]);

    if (report.status !== "ok") throw new Error("expected a report");
    expect(report.rolling?.[0]?.points.map((point) => point.accuracy)).toEqual([
      expect.closeTo(99.5, 12),
      100,
    ]);
  });

  it("reads the window's years by kickoff, not by the order given", () => {
    const report = qualityReport([...pair(400, "home"), ...pair(1, "home")], ["a", "b"], ["VL"]);

    expect(report).toMatchObject({ firstYear: 2024, lastYear: 2025 });
  });

  it("draws the rolling line once 200 matches are judged", () => {
    const rows = Array.from({ length: 200 }, (_, index) => pair(index, "home")).flat();

    const report = qualityReport(rows, ["a", "b"], ["VL"]);

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

describe("lowestOf", () => {
  it("marks the lowest score only", () => {
    expect(lowestOf([0.612, 0.598, 0.603])).toEqual([false, true, false]);
  });

  it("marks each of the scores that are equal as shown, to three decimals", () => {
    // 0,5984 and 0,5976 both read 0,598; 0,5986 reads 0,599.
    expect(lowestOf([0.5984, 0.5976, 0.5986])).toEqual([true, true, false]);
  });
});

describe("the rows per competition", () => {
  // Model a gives the home side 0,5 and model b 0,2: a home win suits a, an away win b.
  const match = (id: number, competitionCode: string, outcome: "home" | "away") => [
    judged({ model: "a", providerMatchId: id, competitionCode, outcome }),
    judged({
      model: "b",
      providerMatchId: id,
      competitionCode,
      home: 0.2,
      draw: 0.3,
      away: 0.5,
      outcome,
    }),
  ];
  const rows = [
    ...match(1, "M1", "away"),
    ...match(2, "VL", "home"),
    ...match(3, "VL", "home"),
    ...match(4, "VL", "away"),
    // Only one model predicted it: counted in no competition.
    judged({ model: "a", providerMatchId: 5, competitionCode: "M2" }),
  ];

  it("gives each competition with a common match its count and each model's Brier, the lowest marked", () => {
    expect(competitionsOf(commonMatches(rows, ["a", "b"]), ["a", "b"], ["VL", "M1", "M2"])).toEqual(
      [
        {
          code: "VL",
          matches: 3,
          brier: [expect.closeTo((0.38 + 0.38 + 0.98) / 3, 12), expect.closeTo(0.78, 12)],
          best: [true, false],
        },
        {
          code: "M1",
          matches: 1,
          brier: [expect.closeTo(0.98, 12), expect.closeTo(0.38, 12)],
          best: [false, true],
        },
      ]
    );
  });

  it("counts a match once, under its first model's competition, when its rows are filed apart", () => {
    const apart = [
      ...match(1, "VL", "home"),
      judged({ model: "a", providerMatchId: 2, competitionCode: "VL" }),
      judged({ model: "b", providerMatchId: 2, competitionCode: "M1" }),
    ];

    expect(inCompetition(apart, ["a", "b"], "VL")).toHaveLength(4);
    expect(inCompetition(apart, ["a", "b"], "M1")).toEqual([]);
    // Both matches under VL, each model's Brier over both: nothing divided by an empty set.
    expect(competitionsOf(apart, ["a", "b"], ["VL", "M1"])).toEqual([
      {
        code: "VL",
        matches: 2,
        brier: [expect.closeTo(0.38, 12), expect.closeTo(0.68, 12)],
        best: [true, false],
      },
    ]);
    expect(qualityReport(apart, ["a", "b"], ["VL", "M1"], "VL")).toMatchObject({ matches: 2 });
    expect(qualityReport(apart, ["a", "b"], ["VL", "M1"], "M1")).toEqual({ status: "empty" });
  });

  it("lists them in the order given, not the order the rows come in", () => {
    const common = commonMatches(rows, ["a", "b"]);

    expect(competitionsOf(common, ["a", "b"], ["M1", "VL"]).map((row) => row.code)).toEqual([
      "M1",
      "VL",
    ]);
  });

  it("leaves out a competition that is not in the order", () => {
    const common = commonMatches(rows, ["a", "b"]);

    expect(competitionsOf(common, ["a", "b"], ["M1"]).map((row) => row.code)).toEqual(["M1"]);
  });

  it("are in the report, counting only matches every model predicted", () => {
    const report = qualityReport(rows, ["a", "b"], ["VL", "M1", "M2"]);

    expect(report).toMatchObject({
      matches: 4,
      competitions: [
        { code: "VL", matches: 3 },
        { code: "M1", matches: 1 },
      ],
    });
  });

  it("stay whole in a report of one competition, whose other figures count that competition only", () => {
    const report = qualityReport(rows, ["a", "b"], ["VL", "M1", "M2"], "M1");

    expect(report).toMatchObject({
      status: "ok",
      matches: 1,
      totals: [
        { model: "a", matches: 1, accuracy: 0 },
        { model: "b", matches: 1, accuracy: 100 },
      ],
      // Under 200 matches in the one competition: no rolling line, as on any page.
      rolling: null,
      seasons: [{ seasonId: 2024, matches: 1 }],
      competitions: [
        { code: "VL", matches: 3 },
        { code: "M1", matches: 1 },
      ],
    });
  });

  it("is empty for a competition without a match every model predicted, though others have one", () => {
    expect(qualityReport(rows, ["a", "b"], ["VL", "M1", "M2"], "M2")).toEqual({ status: "empty" });
  });
});
