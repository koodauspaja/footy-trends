/**
 * The predictions log's I/O (specs/052): the hourly run and the backtest.
 * What either decides lives in `prediction-log.ts` and
 * `prediction-backtest.ts`; this reads, refreshes and writes.
 */

import { and, eq, gt, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, predictions, tasoMatches } from "@/db/schema";
import { categoryIdsFor, competitionForSeasonPair } from "./domestic-competitions";
import { getSeasonMatches as getFootballDataSeasonMatches } from "./football-data";
import { COMPETITIONS } from "./goals-per-game";
import { HOME_BASELINE_MODEL } from "./home-baseline";
import { logger } from "./logger";
import {
  FOOTBALL_DATA_AWAY_GOALS,
  FOOTBALL_DATA_HOME_GOALS,
  getHomeBaseline,
} from "./match-service";
import type { MatchSource } from "./match-source";
import { createPacer, FOOTBALL_DATA_PER_MINUTE, type Paced, TASO_PER_MINUTE } from "./pacer";
import { backtestRows, type FinishedMatch } from "./prediction-backtest";
import {
  isLoggable,
  LOG_WINDOW_HOURS,
  type LogCandidate,
  liveRow,
  type PredictionRow,
  RESULT_WINDOW_HOURS,
  type RefreshTarget,
  refreshTargets,
} from "./prediction-log";
import { synchronizeMatches as synchronizeFootballDataMatches } from "./standings-service";
import { getSeasonMatches as getTasoSeasonMatches } from "./taso";
import { synchronizeMatches as synchronizeTasoMatches } from "./taso-standings-service";

const FINISHED_STATUS = "FINISHED";
const HOUR_MS = 60 * 60 * 1000;
/** Rows per insert: 11 columns each, well under Postgres's 65 535 parameters. */
const WRITE_BATCH = 1000;

const TASO_CODES = [...COMPETITIONS.taso];

/** Stored matches of the compared competitions kicking off inside either window. */
async function readCandidates(now: Date): Promise<LogCandidate[]> {
  const from = new Date(now.getTime() - RESULT_WINDOW_HOURS * HOUR_MS);
  const to = new Date(now.getTime() + LOG_WINDOW_HOURS * HOUR_MS);

  const [footballData, taso] = await Promise.all([
    db
      .select({
        code: matches.competitionCode,
        seasonId: matches.seasonId,
        providerMatchId: matches.providerMatchId,
        kickoffAt: matches.kickoffAt,
        status: matches.status,
        homeGoals: matches.homeGoals,
        awayGoals: matches.awayGoals,
      })
      .from(matches)
      .where(
        and(
          inArray(matches.competitionCode, [...COMPETITIONS["football-data"]]),
          gt(matches.kickoffAt, from),
          lte(matches.kickoffAt, to)
        )
      ),
    db
      .select({
        competitionId: tasoMatches.competitionCode,
        categoryId: tasoMatches.categoryId,
        seasonId: tasoMatches.seasonId,
        providerMatchId: tasoMatches.providerMatchId,
        kickoffAt: tasoMatches.kickoffAt,
        status: tasoMatches.status,
        homeGoals: tasoMatches.homeGoals,
        awayGoals: tasoMatches.awayGoals,
      })
      .from(tasoMatches)
      .where(
        and(
          inArray(tasoMatches.categoryId, TASO_CODES.flatMap(categoryIdsFor)),
          gt(tasoMatches.kickoffAt, from),
          lte(tasoMatches.kickoffAt, to)
        )
      ),
  ]);

  const hasResult = (row: { status: string; homeGoals: number | null; awayGoals: number | null }) =>
    row.status === FINISHED_STATUS && row.homeGoals !== null && row.awayGoals !== null;

  return [
    ...footballData.map((row) => ({
      source: "football-data" as const,
      code: row.code,
      seasonId: row.seasonId,
      providerMatchId: row.providerMatchId,
      kickoffAt: row.kickoffAt,
      status: row.status,
      hasResult: hasResult(row),
    })),
    ...taso.flatMap((row) => {
      const code = competitionForSeasonPair(
        TASO_CODES,
        row.competitionId,
        row.categoryId,
        row.seasonId
      );
      return code === null
        ? []
        : [
            {
              source: "taso" as const,
              code,
              seasonId: row.seasonId,
              competitionId: row.competitionId,
              categoryId: row.categoryId,
              providerMatchId: row.providerMatchId,
              kickoffAt: row.kickoffAt,
              status: row.status,
              hasResult: hasResult(row),
            },
          ];
    }),
  ];
}

/**
 * Fetches a competition-season again and stores it, through each provider's
 * 15-minute response cache and the sync every page uses. Not through the
 * pages' own staleness check: football-data's is an hour by default, and an
 * hourly run gated by it would skip every other refresh.
 */
async function refresh(target: RefreshTarget, paced: Record<MatchSource["kind"], Paced>) {
  if (target.source === "football-data") {
    const fetched = await paced["football-data"](() =>
      getFootballDataSeasonMatches(target.code, target.seasonId)
    );
    await synchronizeFootballDataMatches(fetched);
    return;
  }
  const { competitionId, categoryId, seasonId } = target;
  const fetched = await paced.taso(() => getTasoSeasonMatches(competitionId, categoryId, seasonId));
  await synchronizeTasoMatches(fetched);
}

function batches<T>(rows: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size)
  );
}

/** Upserts rows, one per match, model and kind (S3). The batches are disjoint. */
async function writePredictions(rows: readonly PredictionRow[]): Promise<void> {
  await Promise.all(
    batches(rows, WRITE_BATCH).map((batch) =>
      db
        .insert(predictions)
        .values(batch)
        .onConflictDoUpdate({
          target: [
            predictions.source,
            predictions.providerMatchId,
            predictions.model,
            predictions.kind,
          ],
          set: {
            competitionCode: sql`excluded.competition_code`,
            homeProbability: sql`excluded.home_probability`,
            drawProbability: sql`excluded.draw_probability`,
            awayProbability: sql`excluded.away_probability`,
            predictedAt: sql`excluded.predicted_at`,
            kickoffAt: sql`excluded.kickoff_at`,
          },
        })
    )
  );
}

/** The run's pacers: football-data at 9 a minute, TASO at 60. */
function defaultPacers(): Record<MatchSource["kind"], Paced> {
  return {
    "football-data": createPacer(FOOTBALL_DATA_PER_MINUTE),
    taso: createPacer(TASO_PER_MINUTE),
  };
}

export type PredictionRunReport = {
  refreshed: number;
  logged: number;
  /** One line per competition that failed, to refresh or to predict. */
  failures: string[];
};

/**
 * One hourly run (S1): refresh what needs it, then log every loggable match.
 *
 * A competition that fails to refresh is still logged from what is stored,
 * and one whose baseline fails is skipped; either is reported, so the run
 * exits non-zero while the others are logged. A failed write fails the run.
 *
 * The clock is read again just before writing: pacing the refreshes can take
 * minutes, and a match that kicked off in the meantime must not be written
 * after its kickoff (S5).
 */
export async function runPredictionLog(
  clock: () => Date = () => new Date(),
  paced: Record<MatchSource["kind"], Paced> | undefined = undefined
): Promise<PredictionRunReport> {
  const pacers = paced ?? defaultPacers();
  const startedAt = clock();
  const targets = refreshTargets(await readCandidates(startedAt), startedAt);

  // Started together; each provider's pacer still spaces its own requests.
  const refreshes = await Promise.all(
    targets.map(async (target) => {
      try {
        await refresh(target, pacers);
        return null;
      } catch (error) {
        logger.error({ err: error, ...target }, "Unable to refresh a competition for predictions");
        return `refresh ${target.source} ${target.code} ${target.seasonId}`;
      }
    })
  );
  const refreshFailures = refreshes.filter((failure) => failure !== null);
  const failures = [...refreshFailures];

  // Read again: the refresh may have moved a kickoff or finished a match (S4, S5).
  const candidates = await readCandidates(startedAt);
  const keyOf = (candidate: LogCandidate) => `${candidate.source}:${candidate.code}`;
  const competitions = new Map(
    candidates
      .filter((candidate) => isLoggable(candidate, startedAt))
      .map((candidate) => [keyOf(candidate), candidate] as const)
  );
  const baselines = new Map(
    await Promise.all(
      [...competitions].map(
        async ([key, candidate]) =>
          [key, await getHomeBaseline(candidate.source, candidate.code)] as const
      )
    )
  );
  for (const [key, baseline] of baselines) {
    if (baseline.status === "error") failures.push(`baseline ${key}`);
  }

  const writtenAt = clock();
  const rows = candidates
    .filter((candidate) => isLoggable(candidate, writtenAt))
    .flatMap((candidate) => {
      const baseline = baselines.get(keyOf(candidate));
      const row =
        baseline === undefined
          ? null
          : liveRow(candidate, baseline, HOME_BASELINE_MODEL, writtenAt);
      return row === null ? [] : [row];
    });

  await writePredictions(rows);
  return { refreshed: targets.length - refreshFailures.length, logged: rows.length, failures };
}

/** Every stored finished match of the compared competitions, its score after extra time. */
async function readFinished(): Promise<FinishedMatch[]> {
  const [footballData, taso] = await Promise.all([
    db
      .select({
        code: matches.competitionCode,
        providerMatchId: matches.providerMatchId,
        kickoffAt: matches.kickoffAt,
        homeGoals: sql<number>`${FOOTBALL_DATA_HOME_GOALS}`.mapWith(Number),
        awayGoals: sql<number>`${FOOTBALL_DATA_AWAY_GOALS}`.mapWith(Number),
      })
      .from(matches)
      .where(
        and(
          inArray(matches.competitionCode, [...COMPETITIONS["football-data"]]),
          eq(matches.status, FINISHED_STATUS),
          isNotNull(matches.homeGoals),
          isNotNull(matches.awayGoals)
        )
      ),
    db
      .select({
        competitionId: tasoMatches.competitionCode,
        categoryId: tasoMatches.categoryId,
        seasonId: tasoMatches.seasonId,
        providerMatchId: tasoMatches.providerMatchId,
        kickoffAt: tasoMatches.kickoffAt,
        homeGoals: tasoMatches.homeGoals,
        awayGoals: tasoMatches.awayGoals,
      })
      .from(tasoMatches)
      .where(
        and(
          inArray(tasoMatches.categoryId, TASO_CODES.flatMap(categoryIdsFor)),
          eq(tasoMatches.status, FINISHED_STATUS),
          isNotNull(tasoMatches.homeGoals),
          isNotNull(tasoMatches.awayGoals)
        )
      ),
  ]);

  return [
    ...footballData.map((row) => ({ source: "football-data" as const, ...row })),
    ...taso.flatMap(({ competitionId, categoryId, seasonId, homeGoals, awayGoals, ...row }) => {
      const code = competitionForSeasonPair(TASO_CODES, competitionId, categoryId, seasonId);
      // Both scores are non-null by the query; the check narrows the type.
      return code === null || homeGoals === null || awayGoals === null
        ? []
        : [{ source: "taso" as const, code, homeGoals, awayGoals, ...row }];
    }),
  ];
}

/**
 * The backtest (S10): one `backtest` row for every stored finished match with
 * history, written idempotently. Stored rows only — no provider request.
 */
export async function runPredictionBacktest(now: Date = new Date()): Promise<number> {
  const rows = backtestRows(await readFinished(), HOME_BASELINE_MODEL, now);
  await writePredictions(rows);
  return rows.length;
}
