/**
 * How good the logged predictions are: accuracy, Brier score, log-loss and
 * calibration, per model, over the same matches. Pure: the service reads the
 * predictions with their results, and every figure is computed here.
 *
 * decisions/054-prediction-quality.md
 * decisions/056-accuracy-by-competition.md
 */

/**
 * What happened, from the home side's point of view.
 *
 * decisions/054-prediction-quality.md
 */
export type Outcome = "home" | "draw" | "away";

/**
 * One logged prediction whose match has a result.
 *
 * decisions/054-prediction-quality.md
 * decisions/056-accuracy-by-competition.md
 */
export type JudgedPrediction = {
  model: string;
  providerMatchId: number;
  competitionCode: string;
  seasonId: number;
  kickoffAt: Date;
  home: number;
  draw: number;
  away: number;
  outcome: Outcome;
};

/**
 * Rolling accuracy is over this many matches.
 *
 * decisions/054-prediction-quality.md
 */
export const ROLLING_WINDOW = 200;

/**
 * A calibration bin with fewer probabilities than this is left off.
 *
 * decisions/054-prediction-quality.md
 */
export const CALIBRATION_MINIMUM = 50;

/**
 * Log-loss takes at least this probability, so one certain miss is not infinite.
 *
 * decisions/054-prediction-quality.md
 */
export const LOG_LOSS_FLOOR = 0.001;

/**
 * A Brier score and a log-loss are shown, and compared, to this many decimals.
 *
 * decisions/056-accuracy-by-competition.md
 */
export const SCORE_DECIMALS = 3;

const OUTCOMES: readonly Outcome[] = ["home", "draw", "away"];

/**
 * The outcome given the highest probability; a tie goes home, then draw.
 *
 * decisions/054-prediction-quality.md
 */
export function pickOf(prediction: Pick<JudgedPrediction, Outcome>): Outcome {
  if (prediction.home >= prediction.draw && prediction.home >= prediction.away) return "home";
  return prediction.draw >= prediction.away ? "draw" : "away";
}

/**
 * Multi-class Brier score: 0 is perfect, 2 the worst.
 *
 * decisions/054-prediction-quality.md
 */
export function brierOf(prediction: Pick<JudgedPrediction, Outcome | "outcome">): number {
  return OUTCOMES.reduce((sum, outcome) => {
    const happened = prediction.outcome === outcome ? 1 : 0;
    return sum + (prediction[outcome] - happened) ** 2;
  }, 0);
}

/**
 * Log-loss of one prediction: `−ln p` of what happened, floored at 0,001.
 *
 * decisions/054-prediction-quality.md
 */
export function logLossOf(prediction: Pick<JudgedPrediction, Outcome | "outcome">): number {
  return -Math.log(Math.max(prediction[prediction.outcome], LOG_LOSS_FLOOR));
}

/**
 * Only the matches every given model predicted, so the models are judged on
 * exactly the same ones.
 *
 * decisions/054-prediction-quality.md
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

/**
 * One point of the rolling line: the latest match's kickoff (epoch ms) and the share right, 0–100.
 *
 * decisions/054-prediction-quality.md
 */
export type RollingPoint = { at: number; accuracy: number };

/**
 * The thinned line keeps at most this many windows, plus the last: a 640-unit chart shows no more.
 *
 * decisions/054-prediction-quality.md
 */
export const ROLLING_POINTS = 400;

export type SeasonBrier = {
  seasonId: number;
  matches: number;
  /** Per model, in the report's model order. */
  brier: number[];
};

/**
 * One competition's row: its judged matches and each model's Brier score.
 *
 * decisions/056-accuracy-by-competition.md
 */
export type CompetitionBrier = {
  code: string;
  matches: number;
  /** Per model, in the report's model order. */
  brier: number[];
  /** Per model: whether its score is the row's lowest as shown, a tie marking each. */
  best: boolean[];
};

export type CalibrationBin = {
  /** The bin's lower edge, 0–90 in tens. */
  from: number;
  probabilities: number;
  /** 0–100, how often the binned outcome happened; null below the minimum. */
  observed: number | null;
};

/**
 * JSON-safe, so the service can cache it as it is.
 *
 * decisions/054-prediction-quality.md
 * decisions/056-accuracy-by-competition.md
 */
export type QualityReport =
  | { status: "empty" }
  | {
      status: "ok";
      models: string[];
      matches: number;
      /** The kickoff years the window spans, for the line that names it. */
      firstYear: number;
      lastYear: number;
      totals: ModelTotals[];
      /** Per model, or null when fewer than 200 matches are judged. */
      rolling: Array<{ model: string; points: RollingPoint[] }> | null;
      seasons: SeasonBrier[];
      calibration: Array<{ model: string; bins: CalibrationBin[] }>;
      /** Whether any bin was left off, so the page says so. */
      binsOmitted: boolean;
      /** Every competition with a judged match, whichever one the rest counts. */
      competitions: CompetitionBrier[];
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
 * thinned to every step-th window, at most 400, plus always the last.
 *
 * decisions/054-prediction-quality.md
 */
export function rollingOf(predictions: readonly JudgedPrediction[]): RollingPoint[] {
  if (predictions.length < ROLLING_WINDOW) return [];
  const right = predictions.map((prediction) => (isRight(prediction) ? 1 : 0));
  const step = Math.ceil((predictions.length - ROLLING_WINDOW + 1) / ROLLING_POINTS);
  const points: RollingPoint[] = [];
  let hits = 0;
  predictions.forEach((prediction, index) => {
    hits += right[index] as number;
    if (index >= ROLLING_WINDOW) hits -= right[index - ROLLING_WINDOW] as number;
    const end = index + 1;
    if (end < ROLLING_WINDOW) return;
    const isLast = end === predictions.length;
    if ((end - ROLLING_WINDOW) % step === 0 || isLast) {
      points.push({ at: prediction.kickoffAt.getTime(), accuracy: (hits / ROLLING_WINDOW) * 100 });
    }
  });
  return points;
}

/**
 * Every probability (three per match) in bins of ten; under 50 left off.
 *
 * decisions/054-prediction-quality.md
 */
export function calibrationOf(predictions: readonly JudgedPrediction[]): CalibrationBin[] {
  const counts = Array.from({ length: 10 }, () => ({ count: 0, hits: 0 }));
  for (const prediction of predictions) {
    for (const outcome of OUTCOMES) {
      // [0,10) … [90,100]: a probability of exactly 1 belongs to the last bin.
      const bin = counts[Math.min(9, Math.floor(prediction[outcome] * 10))] as {
        count: number;
        hits: number;
      };
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
 * Which of a row's scores are its lowest, compared as the page shows them.
 *
 * decisions/056-accuracy-by-competition.md
 */
export function lowestOf(scores: readonly number[]): boolean[] {
  const shown = scores.map((value) => Number(value.toFixed(SCORE_DECIMALS)));
  const lowest = Math.min(...shown);
  return shown.map((value) => value === lowest);
}

/**
 * Each model's Brier score over the same rows, in the models' order.
 *
 * decisions/054-prediction-quality.md
 * decisions/056-accuracy-by-competition.md
 */
function brierPerModel(rows: readonly JudgedPrediction[], models: readonly string[]): number[] {
  return models.map((model) =>
    mean(rows.filter((prediction) => prediction.model === model).map(brierOf))
  );
}

/**
 * The rows of one competition's matches. A match is of the competition its
 * first model's row is filed under, so every model's row of a match is kept
 * or dropped with it.
 *
 * decisions/056-accuracy-by-competition.md
 */
export function inCompetition(
  common: readonly JudgedPrediction[],
  models: readonly string[],
  code: string
): JudgedPrediction[] {
  const matches = new Set(
    common
      .filter((prediction) => prediction.model === models[0] && prediction.competitionCode === code)
      .map((prediction) => prediction.providerMatchId)
  );
  return common.filter((prediction) => matches.has(prediction.providerMatchId));
}

/**
 * A row per competition of the given order that has a match every model
 * predicted, in that order.
 *
 * decisions/056-accuracy-by-competition.md
 */
export function competitionsOf(
  common: readonly JudgedPrediction[],
  models: readonly string[],
  order: readonly string[]
): CompetitionBrier[] {
  return order.flatMap((code) => {
    const rows = inCompetition(common, models, code);
    if (rows.length === 0) return [];
    const brier = brierPerModel(rows, models);
    return [{ code, matches: rows.length / models.length, brier, best: lowestOf(brier) }];
  });
}

/**
 * Every figure for one provider and kind: only the matches every model
 * predicted, each model judged on them. Given a competition, every figure but
 * the rows per competition counts that competition's matches only.
 *
 * decisions/054-prediction-quality.md
 * decisions/056-accuracy-by-competition.md
 */
export function qualityReport(
  predictions: readonly JudgedPrediction[],
  models: readonly string[],
  competitionOrder: readonly string[],
  competition: string | null = null
): QualityReport {
  const everyCompetition = commonMatches(predictions, models);
  const common = (
    competition === null ? everyCompetition : inCompetition(everyCompetition, models, competition)
  ).toSorted(byKickoff);
  if (common.length === 0) return { status: "empty" };

  // One row per match and model (the log's unique key), so a model's rows are
  // the matches judged.
  const perModel = models.map((model) => ({
    model,
    rows: common.filter((prediction) => prediction.model === model),
  }));
  const matches = common.length / models.length;
  const seasonIds = [...new Set(common.map((prediction) => prediction.seasonId))].toSorted(
    (left, right) => left - right
  );
  const calibration = perModel.map(({ model, rows }) => ({ model, bins: calibrationOf(rows) }));
  return {
    status: "ok",
    models: [...models],
    matches,
    firstYear: (common[0] as JudgedPrediction).kickoffAt.getUTCFullYear(),
    lastYear: (common.at(-1) as JudgedPrediction).kickoffAt.getUTCFullYear(),
    totals: perModel.map(({ model, rows }) => ({
      model,
      matches: rows.length,
      accuracy: mean(rows.map((prediction) => (isRight(prediction) ? 100 : 0))),
      brier: mean(rows.map(brierOf)),
      logLoss: mean(rows.map(logLossOf)),
    })),
    rolling:
      matches < ROLLING_WINDOW
        ? null
        : perModel.map(({ model, rows }) => ({ model, points: rollingOf(rows) })),
    seasons: seasonIds.map((seasonId) => {
      const inSeason = common.filter((prediction) => prediction.seasonId === seasonId);
      return {
        seasonId,
        matches: inSeason.length / models.length,
        brier: brierPerModel(inSeason, models),
      };
    }),
    calibration,
    binsOmitted: calibration.some(({ bins }) => bins.some((bin) => bin.observed === null)),
    competitions: competitionsOf(everyCompetition, models, competitionOrder),
  };
}
