/**
 * The hourly predictions run (specs/052): which stored matches it logs, which
 * competitions it refreshes first, and the row it writes.
 *
 * Pure: `prediction-log-service.ts` reads the stored matches, refreshes, reads
 * the baselines and writes; everything it decides is decided here.
 */

import type { HomeBaseline } from "./home-baseline";
import type { MatchSource } from "./match-source";

/** Upcoming matches kicking off within this many hours are logged (S7). */
export const LOG_WINDOW_HOURS = 48;

/** A match without a result is fetched for this long after kickoff (S15). */
export const RESULT_WINDOW_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

/** What specs/051 predicts: a match not yet kicked off (S3). */
const UPCOMING: ReadonlySet<string> = new Set(["SCHEDULED", "TIMED"]);

/**
 * Where a competition-season is fetched from: football-data by its code, TASO
 * by the season's `(competition_id, category_id)` pair, which its fetch needs.
 */
export type RefreshTarget =
  | { source: "football-data"; code: string; seasonId: number }
  | { source: "taso"; code: string; seasonId: number; competitionId: string; categoryId: string };

/** One stored match of a compared competition, near enough to now to matter. */
export type LogCandidate = RefreshTarget & {
  providerMatchId: number;
  kickoffAt: Date;
  status: string;
  /** Finished with both scores stored (specs/049, S3). */
  hasResult: boolean;
};

/** A row of `predictions`, as the run writes it. */
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
 * status can lag, so a passed kickoff is never written (S5) — and inside the
 * window (S7).
 */
export function isLoggable(candidate: LogCandidate, now: Date): boolean {
  const kickoff = candidate.kickoffAt.getTime();
  return (
    UPCOMING.has(candidate.status) &&
    kickoff > now.getTime() &&
    kickoff <= now.getTime() + LOG_WINDOW_HOURS * HOUR_MS
  );
}

/** Whether a match kicked off recently and its result has not been stored (S15). */
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
 * a result to fetch, each once however many of its matches qualify (S13, S15).
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
 * the baseline has no percentages to give (specs/051 S9, S11).
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
