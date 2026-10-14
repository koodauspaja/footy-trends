/**
 * The hourly predictions run: which stored matches it logs, which competitions
 * it refreshes first, and the row it writes. Pure: the service does the I/O.
 *
 * decisions/052-predictions-log.md
 * decisions/049-home-advantage-and-draw-rate.md
 * decisions/055-poisson-goal-model.md
 */

import { ELO_MODEL, predictElo, type TeamRating } from "./elo";
import type { HomeBaseline } from "./home-baseline";
import type { MatchSource } from "./match-source";
import { POISSON_MODEL, type PoissonFit, predictPoisson } from "./poisson";

/**
 * Upcoming matches kicking off within this many hours are logged.
 *
 * decisions/052-predictions-log.md
 */
export const LOG_WINDOW_HOURS = 48;

/**
 * A match without a result is fetched for this long after kickoff.
 *
 * decisions/052-predictions-log.md
 */
export const RESULT_WINDOW_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

/**
 * What the baseline predicts: a match not yet kicked off.
 *
 * decisions/051-home-win-baseline.md
 * decisions/052-predictions-log.md
 */
const UPCOMING: ReadonlySet<string> = new Set(["SCHEDULED", "TIMED"]);

/**
 * Where a competition-season is fetched from: football-data by its code, TASO
 * by the season's `(competition_id, category_id)` pair, which its fetch needs.
 *
 * decisions/052-predictions-log.md
 */
export type RefreshTarget =
  | { source: "football-data"; code: string; seasonId: number }
  | { source: "taso"; code: string; seasonId: number; competitionId: string; categoryId: string };

/**
 * One stored match of a compared competition, near enough to now to matter.
 *
 * decisions/052-predictions-log.md
 */
export type LogCandidate = RefreshTarget & {
  providerMatchId: number;
  homeTeam: number;
  awayTeam: number;
  kickoffAt: Date;
  status: string;
  /** Finished with both scores stored. */
  hasResult: boolean;
};

/**
 * A row of `predictions`, as the run writes it.
 *
 * decisions/052-predictions-log.md
 */
export type PredictionRow = {
  source: MatchSource["kind"];
  providerMatchId: number;
  competitionCode: string;
  model: string;
  kind: "live" | "backtest";
  homeProbability: number;
  drawProbability: number;
  awayProbability: number;
  predictedAt: Date;
  kickoffAt: Date;
};

/**
 * Whether a match is logged this run: not yet kicked off by the clock — its
 * status can lag, so a passed kickoff is never written — and inside the
 * window.
 *
 * decisions/052-predictions-log.md
 */
export function isLoggable(candidate: LogCandidate, now: Date): boolean {
  const kickoff = candidate.kickoffAt.getTime();
  return (
    UPCOMING.has(candidate.status) &&
    kickoff > now.getTime() &&
    kickoff <= now.getTime() + LOG_WINDOW_HOURS * HOUR_MS
  );
}

/**
 * Whether a match kicked off recently and its result has not been stored.
 *
 * decisions/052-predictions-log.md
 */
export function awaitsResult(candidate: LogCandidate, now: Date): boolean {
  const kickoff = candidate.kickoffAt.getTime();
  return (
    !candidate.hasResult &&
    kickoff <= now.getTime() &&
    kickoff > now.getTime() - RESULT_WINDOW_HOURS * HOUR_MS
  );
}

/**
 * The competition-seasons to fetch before logging: any with a match to log or
 * a result to fetch, each once however many of its matches qualify.
 *
 * decisions/052-predictions-log.md
 */
export function refreshTargets(candidates: readonly LogCandidate[], now: Date): RefreshTarget[] {
  const targets = new Map<string, RefreshTarget>();
  for (const candidate of candidates) {
    if (!isLoggable(candidate, now) && !awaitsResult(candidate, now)) continue;
    const target: RefreshTarget =
      candidate.source === "football-data"
        ? { source: candidate.source, code: candidate.code, seasonId: candidate.seasonId }
        : {
            source: candidate.source,
            code: candidate.code,
            seasonId: candidate.seasonId,
            competitionId: candidate.competitionId,
            categoryId: candidate.categoryId,
          };
    const key = Object.values(target).join(":");
    if (!targets.has(key)) targets.set(key, target);
  }
  return [...targets.values()];
}

/**
 * The live row for a match, from its competition's baseline — or nothing when
 * the baseline has no percentages to give.
 *
 * decisions/052-predictions-log.md
 */
export function liveRow(
  candidate: LogCandidate,
  baseline: HomeBaseline,
  model: string,
  now: Date
): PredictionRow | null {
  if (baseline.status !== "ok") return null;
  return {
    source: candidate.source,
    providerMatchId: candidate.providerMatchId,
    competitionCode: candidate.code,
    model,
    kind: "live",
    homeProbability: baseline.homeShare / 100,
    drawProbability: baseline.drawShare / 100,
    awayProbability: baseline.awayShare / 100,
    predictedAt: now,
    kickoffAt: candidate.kickoffAt,
  };
}

/**
 * The `elo-v1` live row for a match: the current ratings, and the
 * competition's draw share from its baseline — or nothing without a
 * draw share or with a placeholder side.
 *
 * decisions/053-elo-ratings.md
 */
export function eloLiveRow(
  candidate: LogCandidate,
  ratings: ReadonlyMap<number, TeamRating>,
  baseline: HomeBaseline,
  now: Date
): PredictionRow | null {
  if (baseline.status !== "ok") return null;
  const elo = predictElo(
    ratings,
    candidate.homeTeam,
    candidate.awayTeam,
    candidate.seasonId,
    baseline.drawShare / 100
  );
  if (elo === null) return null;
  return {
    source: candidate.source,
    providerMatchId: candidate.providerMatchId,
    competitionCode: candidate.code,
    model: ELO_MODEL,
    kind: "live",
    homeProbability: elo.prediction.home,
    drawProbability: elo.prediction.draw,
    awayProbability: elo.prediction.away,
    predictedAt: now,
    kickoffAt: candidate.kickoffAt,
  };
}

/**
 * The `poisson-v1` live row for a match, from its provider's fit — or nothing
 * for a placeholder side or a competition the fit has no match of.
 *
 * decisions/055-poisson-goal-model.md
 */
export function poissonLiveRow(
  candidate: LogCandidate,
  fit: PoissonFit,
  now: Date
): PredictionRow | null {
  const poisson = predictPoisson(fit, candidate.code, candidate.homeTeam, candidate.awayTeam);
  if (poisson === null) return null;
  return {
    source: candidate.source,
    providerMatchId: candidate.providerMatchId,
    competitionCode: candidate.code,
    model: POISSON_MODEL,
    kind: "live",
    homeProbability: poisson.prediction.home,
    drawProbability: poisson.prediction.draw,
    awayProbability: poisson.prediction.away,
    predictedAt: now,
    kickoffAt: candidate.kickoffAt,
  };
}
