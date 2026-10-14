/**
 * The backtest: what a model would have predicted for every stored finished
 * match, from the matches of its competition that kicked off strictly before
 * it. Pure: the service reads and writes.
 *
 * decisions/052-predictions-log.md
 * decisions/053-elo-ratings.md
 * decisions/055-poisson-goal-model.md
 * decisions/057-surprise-index.md
 * decisions/059-cup-predictions.md
 * decisions/060-elo-variants.md
 */

import { ELO_MODEL, type EloMatch, replayElo, type ThreeWay, threeWay } from "./elo";
import { ELO_FORM_MODEL, ELO_HOME_MODEL, replayVariants } from "./elo-variants";
import { HOME_BASELINE_MODEL, homeBaseline } from "./home-baseline";
import type { MatchSource } from "./match-source";
import { POISSON_MODEL, replayPoisson } from "./poisson";
import type { PredictionRow } from "./prediction-log";

/**
 * One finished match, its score after extra time with a shoot-out taken out,
 * with the two teams and the season, which Elo needs.
 *
 * decisions/049-home-advantage-and-draw-rate.md
 * decisions/052-predictions-log.md
 * decisions/053-elo-ratings.md
 */
export type FinishedMatch = EloMatch;

type Tally = { matches: number; homeWins: number; draws: number; awayWins: number };

function add(tally: Tally, match: FinishedMatch): Tally {
  return {
    matches: tally.matches + 1,
    homeWins: tally.homeWins + (match.homeGoals > match.awayGoals ? 1 : 0),
    draws: tally.draws + (match.homeGoals === match.awayGoals ? 1 : 0),
    awayWins: tally.awayWins + (match.homeGoals < match.awayGoals ? 1 : 0),
  };
}

/**
 * The baseline from a tally, through the baseline's own rule.
 *
 * decisions/051-home-win-baseline.md
 * decisions/052-predictions-log.md
 */
function sharesOf(tally: Tally, code: string, source: MatchSource["kind"]) {
  return homeBaseline([
    { kind: source, code, seasonId: 0, leftToPlay: 0, spansCalendarYears: false, ...tally },
  ]);
}

/**
 * Whether a match can be predicted for its sides: always in a league; in a cup
 * only when the Elo replay predicts it, which rates both sides first.
 *
 * decisions/059-cup-predictions.md
 */
function ratedSides(finished: readonly FinishedMatch[]): (match: FinishedMatch) => boolean {
  const predicted = new Set<string>();
  for (const source of ["football-data", "taso"] as const) {
    replayElo(
      finished.filter((match) => match.source === source),
      (match) => {
        if (match.cup) predicted.add(`${match.source}:${match.providerMatchId}`);
      }
    );
  }
  return (match) => !match.cup || predicted.has(`${match.source}:${match.providerMatchId}`);
}

/**
 * One `backtest` row per match with an earlier finished match in its
 * competition, and in a cup only between rated sides. Matches sharing a kickoff
 * are predicted from one tally and added to it together.
 *
 * decisions/052-predictions-log.md
 * decisions/059-cup-predictions.md
 */
export function backtestRows(
  finished: readonly FinishedMatch[],
  model: string,
  now: Date
): PredictionRow[] {
  const byCompetition = new Map<string, FinishedMatch[]>();
  for (const match of finished) {
    const key = `${match.source}:${match.code}`;
    byCompetition.set(key, [...(byCompetition.get(key) ?? []), match]);
  }

  const predictable = ratedSides(finished);
  const rows: PredictionRow[] = [];
  for (const matches of byCompetition.values()) {
    const ordered = matches.toSorted(
      (left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime()
    );
    let tally: Tally = { matches: 0, homeWins: 0, draws: 0, awayWins: 0 };
    let index = 0;
    while (index < ordered.length) {
      // Sorted, so the matches sharing this kickoff are the ones straight after it.
      const kickoff = ordered[index]?.kickoffAt.getTime();
      let end = index;
      while (ordered[end]?.kickoffAt.getTime() === kickoff) end += 1;
      const together = ordered.slice(index, end);
      for (const match of together.filter(predictable)) {
        const baseline = sharesOf(tally, match.code, match.source);
        if (baseline.status !== "ok") continue;
        rows.push({
          source: match.source,
          providerMatchId: match.providerMatchId,
          competitionCode: match.code,
          model,
          kind: "backtest",
          homeProbability: baseline.homeShare / 100,
          drawProbability: baseline.drawShare / 100,
          awayProbability: baseline.awayShare / 100,
          predictedAt: now,
          kickoffAt: match.kickoffAt,
        });
      }
      tally = together.reduce((sum, match) => add(sum, match), tally);
      index += together.length;
    }
  }
  return rows;
}

/**
 * One `elo-v1` backtest row per match the baseline backtest also predicts: the
 * ratings the match was played at, and the draw share of the strictly earlier
 * matches, read from `baseline`.
 *
 * decisions/053-elo-ratings.md
 */
export function eloBacktestRows(
  finished: readonly FinishedMatch[],
  baseline: readonly PredictionRow[],
  now: Date
): PredictionRow[] {
  const drawShares = new Map(
    baseline.map((row) => [`${row.source}:${row.providerMatchId}`, row.drawProbability])
  );
  const rows: PredictionRow[] = [];
  for (const source of ["football-data", "taso"] as const) {
    replayElo(
      finished.filter((match) => match.source === source),
      (match, homeRating, awayRating) => {
        const drawShare = drawShares.get(`${match.source}:${match.providerMatchId}`);
        if (drawShare === undefined) return;
        const prediction = threeWay(homeRating, awayRating, drawShare);
        rows.push({
          source: match.source,
          providerMatchId: match.providerMatchId,
          competitionCode: match.code,
          model: ELO_MODEL,
          kind: "backtest",
          homeProbability: prediction.home,
          drawProbability: prediction.draw,
          awayProbability: prediction.away,
          predictedAt: now,
          kickoffAt: match.kickoffAt,
        });
      }
    );
  }
  return rows;
}

/**
 * One `elo-form-v1` and one `elo-home-v1` backtest row per match the baseline
 * backtest also predicts, as `elo-v1`'s: the ratings and the variants' state
 * the match was played at, and the draw share of the strictly earlier matches.
 *
 * decisions/060-elo-variants.md
 */
export function eloVariantBacktestRows(
  finished: readonly FinishedMatch[],
  baseline: readonly PredictionRow[],
  now: Date
): PredictionRow[] {
  const drawShares = new Map(
    baseline.map((row) => [`${row.source}:${row.providerMatchId}`, row.drawProbability])
  );
  const rows: PredictionRow[] = [];
  const row = (match: FinishedMatch, model: string, prediction: ThreeWay): PredictionRow => ({
    source: match.source,
    providerMatchId: match.providerMatchId,
    competitionCode: match.code,
    model,
    kind: "backtest",
    homeProbability: prediction.home,
    drawProbability: prediction.draw,
    awayProbability: prediction.away,
    predictedAt: now,
    kickoffAt: match.kickoffAt,
  });
  for (const source of ["football-data", "taso"] as const) {
    replayVariants(
      finished.filter((match) => match.source === source),
      (match, predict) => {
        const drawShare = drawShares.get(`${match.source}:${match.providerMatchId}`);
        if (drawShare === undefined) return;
        const { form, home } = predict(drawShare);
        rows.push(row(match, ELO_FORM_MODEL, form), row(match, ELO_HOME_MODEL, home));
      }
    );
  }
  return rows;
}

/**
 * One `poisson-v1` backtest row per match its day's fit can predict: the fit
 * of the provider's matches on strictly earlier UTC days. Given `wanted`, the
 * rows of those matches only, and a fit only for their days.
 *
 * decisions/055-poisson-goal-model.md
 * decisions/057-surprise-index.md
 */
export function poissonBacktestRows(
  finished: readonly FinishedMatch[],
  now: Date,
  wanted?: (match: FinishedMatch) => boolean
): PredictionRow[] {
  const rows: PredictionRow[] = [];
  for (const source of ["football-data", "taso"] as const) {
    replayPoisson(
      finished.filter((match) => match.source === source),
      (match, { prediction }) => {
        rows.push({
          source: match.source,
          providerMatchId: match.providerMatchId,
          competitionCode: match.code,
          model: POISSON_MODEL,
          kind: "backtest",
          homeProbability: prediction.home,
          drawProbability: prediction.draw,
          awayProbability: prediction.away,
          predictedAt: now,
          kickoffAt: match.kickoffAt,
        });
      },
      wanted
    );
  }
  return rows;
}

/**
 * What a written backtest row is known by: its provider, match and model.
 *
 * decisions/057-surprise-index.md
 */
export function backtestKey(
  row: Readonly<{ source: MatchSource["kind"]; providerMatchId: number; model: string }>
): string {
  return `${row.source}:${row.providerMatchId}:${row.model}`;
}

/**
 * The backtest rows of every model that `written` does not hold. The baseline
 * and Elo are replayed whole and filtered; Poisson is fitted only for the days
 * of a match that lacks its row.
 *
 * decisions/057-surprise-index.md
 * decisions/060-elo-variants.md
 */
export function missingBacktestRows(
  finished: readonly FinishedMatch[],
  written: ReadonlySet<string>,
  now: Date
): PredictionRow[] {
  const missing = (rows: readonly PredictionRow[]) =>
    rows.filter((row) => !written.has(backtestKey(row)));
  const baseline = backtestRows(finished, HOME_BASELINE_MODEL, now);
  return [
    ...missing(baseline),
    ...missing(eloBacktestRows(finished, baseline, now)),
    ...missing(eloVariantBacktestRows(finished, baseline, now)),
    ...poissonBacktestRows(
      finished,
      now,
      (match) => !written.has(backtestKey({ ...match, model: POISSON_MODEL }))
    ),
  ];
}
