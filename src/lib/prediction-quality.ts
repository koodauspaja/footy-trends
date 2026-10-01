/**
 * How good the logged predictions are (specs/054): accuracy, Brier score,
 * log-loss and calibration, per model, over the same matches.
 *
 * Pure: `prediction-quality-service.ts` reads the logged predictions with
 * their results; every figure is computed here.
 */

/** What happened, from the home side's point of view. */
export type Outcome = "home" | "draw" | "away";

/** One logged prediction whose match has a result. */
export type JudgedPrediction = {
  model: string;
  providerMatchId: number;
  seasonId: number;
  kickoffAt: Date;
  home: number;
  draw: number;
  away: number;
  outcome: Outcome;
};

/** Rolling accuracy is over this many matches (S6). */
export const ROLLING_WINDOW = 200;

/** A calibration bin with fewer probabilities than this is left off (S8). */
export const CALIBRATION_MINIMUM = 50;

/** Log-loss takes at least this probability, so one certain miss is not infinite (S7). */
export const LOG_LOSS_FLOOR = 0.001;

const OUTCOMES: readonly Outcome[] = ["home", "draw", "away"];

/** The outcome given the highest probability; a tie goes home, then draw (S5). */
export function pickOf(prediction: Pick<JudgedPrediction, Outcome>): Outcome {
  if (prediction.home >= prediction.draw && prediction.home >= prediction.away) return "home";
  return prediction.draw >= prediction.away ? "draw" : "away";
}

/** Multi-class Brier score: 0 is perfect, 2 the worst (S7). */
export function brierOf(prediction: Pick<JudgedPrediction, Outcome | "outcome">): number {
  return OUTCOMES.reduce((sum, outcome) => {
    const happened = prediction.outcome === outcome ? 1 : 0;
    return sum + (prediction[outcome] - happened) ** 2;
  }, 0);
}

/** Log-loss of one prediction: `−ln p` of what happened, floored at 0,001 (S7). */
export function logLossOf(prediction: Pick<JudgedPrediction, Outcome | "outcome">): number {
  return -Math.log(Math.max(prediction[prediction.outcome], LOG_LOSS_FLOOR));
}

/**
 * Only the matches every given model predicted, so the models are judged on
 * exactly the same ones (S4).
 */
export function commonMatches(
  predictions: readonly JudgedPrediction[],
  models: readonly string[]
): JudgedPrediction[] {
  const byMatch = new Map<number, Set<string>>();
  for (const prediction of predictions) {
    const seen = byMatch.get(prediction.providerMatchId) ?? new Set<string>();
    seen.add(prediction.model);
    byMatch.set(prediction.providerMatchId, seen);
  }
  return predictions.filter((prediction) => {
    const seen = byMatch.get(prediction.providerMatchId);
    return models.every((model) => seen?.has(model));
  });
}

export type ModelTotals = {
  model: string;
  matches: number;
  /** 0–100. */
  accuracy: number;
  brier: number;
  logLoss: number;
};

/** One point of the rolling line: the latest match's kickoff (epoch ms) and the share right, 0–100. */
export type RollingPoint = { at: number; accuracy: number };

/** At most this many points per line: a 640-unit chart shows no more (S6). */
export const ROLLING_POINTS = 400;

export type SeasonBrier = {
  seasonId: number;
  matches: number;
  /** Per model, in the report's model order. */
  brier: number[];
};

export type CalibrationBin = {
  /** The bin's lower edge, 0–90 in tens. */
  from: number;
  probabilities: number;
  /** 0–100, how often the binned outcome happened; null below the minimum (S8). */
  observed: number | null;
};

/** JSON-safe, so the service can cache it as it is (S11). */
export type QualityReport =
  | { status: "empty" }
  | {
      status: "ok";
      models: string[];
      matches: number;
      firstSeason: number;
      lastSeason: number;
      totals: ModelTotals[];
      /** Per model, or null when fewer than 200 matches are judged (S14). */
      rolling: RollingPoint[][] | null;
      seasons: SeasonBrier[];
      /** Per model. */
      calibration: CalibrationBin[][];
      /** Whether any bin was left off, so the page says so (S8). */
      binsOmitted: boolean;
    };

const mean = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const isRight = (prediction: JudgedPrediction) => pickOf(prediction) === prediction.outcome;

function byKickoff(left: JudgedPrediction, right: JudgedPrediction): number {
  return (
    left.kickoffAt.getTime() - right.kickoffAt.getTime() ||
    left.providerMatchId - right.providerMatchId
  );
}

/**
 * The share right over each run of 200 consecutive matches, by kickoff,
 * thinned to at most 400 points — always keeping the last (S6).
 */
export function rollingOf(predictions: readonly JudgedPrediction[]): RollingPoint[] {
  if (predictions.length < ROLLING_WINDOW) return [];
  const right = predictions.map((prediction) => (isRight(prediction) ? 1 : 0));
  const step = Math.ceil((predictions.length - ROLLING_WINDOW + 1) / ROLLING_POINTS);
  const points: RollingPoint[] = [];
  let hits = 0;
  predictions.forEach((prediction, index) => {
    hits += right[index] ?? 0;
    if (index >= ROLLING_WINDOW) hits -= right[index - ROLLING_WINDOW] ?? 0;
    const end = index + 1;
    if (end < ROLLING_WINDOW) return;
    const isLast = end === predictions.length;
    if ((end - ROLLING_WINDOW) % step === 0 || isLast) {
      points.push({ at: prediction.kickoffAt.getTime(), accuracy: (hits / ROLLING_WINDOW) * 100 });
    }
  });
  return points;
}

/** Every probability (three per match) in bins of ten; under 50 left off (S8). */
export function calibrationOf(predictions: readonly JudgedPrediction[]): CalibrationBin[] {
  const counts = Array.from({ length: 10 }, () => ({ count: 0, hits: 0 }));
  for (const prediction of predictions) {
    for (const outcome of OUTCOMES) {
      // [0,10) … [90,100]: a probability of exactly 1 belongs to the last bin.
      const bin = counts[Math.min(9, Math.floor(prediction[outcome] * 10))];
      if (bin === undefined) continue;
      bin.count += 1;
      if (prediction.outcome === outcome) bin.hits += 1;
    }
  }
  return counts.map((bin, index) => ({
    from: index * 10,
    probabilities: bin.count,
    observed: bin.count < CALIBRATION_MINIMUM ? null : (bin.hits / bin.count) * 100,
  }));
}

/**
 * Every figure of specs/054 for one provider and kind: only the matches every
 * model predicted (S4), each model judged on them.
 */
export function qualityReport(
  predictions: readonly JudgedPrediction[],
  models: readonly string[]
): QualityReport {
  const common = commonMatches(predictions, models).toSorted(byKickoff);
  const perModel = models.map((model) => common.filter((prediction) => prediction.model === model));
  const matches = perModel[0]?.length ?? 0;
  if (matches === 0) return { status: "empty" };

  const seasonIds = [...new Set(common.map((prediction) => prediction.seasonId))].toSorted(
    (left, right) => left - right
  );
  const calibration = perModel.map(calibrationOf);
  return {
    status: "ok",
    models: [...models],
    matches,
    firstSeason: Math.min(...seasonIds),
    lastSeason: Math.max(...seasonIds),
    totals: perModel.map((own, index) => ({
      model: models[index] ?? "",
      matches: own.length,
      accuracy: mean(own.map((prediction) => (isRight(prediction) ? 100 : 0))),
      brier: mean(own.map(brierOf)),
      logLoss: mean(own.map(logLossOf)),
    })),
    rolling: matches < ROLLING_WINDOW ? null : perModel.map(rollingOf),
    seasons: seasonIds.map((seasonId) => {
      const inSeason = perModel.map((own) =>
        own.filter((prediction) => prediction.seasonId === seasonId)
      );
      return {
        seasonId,
        matches: inSeason[0]?.length ?? 0,
        brier: inSeason.map((own) => mean(own.map(brierOf))),
      };
    }),
    calibration,
    binsOmitted: calibration.some((bins) => bins.some((bin) => bin.observed === null)),
  };
}
