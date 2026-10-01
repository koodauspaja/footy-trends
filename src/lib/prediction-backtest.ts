/**
 * The backtest (specs/052, S2, S10, S14): what a model would have predicted for
 * every stored finished match, from the matches of its competition that kicked
 * off strictly before it.
 *
 * Pure: `prediction-log-service.ts` reads every finished match and writes
 * the rows; which rows, and from what, is decided here.
 */

import { ELO_MODEL, type EloMatch, replayElo, threeWay } from "./elo";
import { homeBaseline } from "./home-baseline";
import type { MatchSource } from "./match-source";
import type { PredictionRow } from "./prediction-log";

/**
 * One finished match, its score after extra time — a shoot-out already taken
 * out, as specs/049 S3 counts it — with the two teams and the season, which
 * Elo needs (specs/053).
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

/** The baseline from a tally, through specs/051's own rule. */
function sharesOf(tally: Tally, code: string, source: MatchSource["kind"]) {
  return homeBaseline([
    { kind: source, code, seasonId: 0, leftToPlay: 0, spansCalendarYears: false, ...tally },
  ]);
}

/**
 * One `backtest` row per match with an earlier finished match in its
 * competition. Matches sharing a kickoff are predicted from the same tally and
 * added to it together, so neither is evidence for the other (S14); a
 * competition's first kickoff has nothing before it and gets no row.
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
      for (const match of together) {
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
 * One `elo-v1` backtest row per match the baseline backtest also predicts
 * (specs/053 S7, S15, S16): the ratings the match was played at, and the
 * draw share of the strictly earlier matches — read from `baseline`, the
 * baseline backtest's rows, so the two models know exactly the same about
 * draws. A competition's first kickoff has no baseline row and so no Elo row.
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
