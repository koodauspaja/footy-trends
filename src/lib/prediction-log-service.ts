/**
 * The predictions log's I/O: the hourly run and the backtest. What either
 * decides lives in `prediction-log.ts` and `prediction-backtest.ts`; this
 * reads, refreshes and writes.
 *
 * decisions/052-predictions-log.md
 * decisions/053-elo-ratings.md
 * decisions/055-poisson-goal-model.md
 */

import { and, eq, gt, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, predictions, tasoMatches } from "@/db/schema";
import { categoryIdsFor, competitionForSeasonPair } from "./domestic-competitions";
import { replayElo, type TeamRating } from "./elo";
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
import { fitPoisson, type PoissonFit, utcDay } from "./poisson";
import {
  backtestRows,
  eloBacktestRows,
  type FinishedMatch,
  poissonBacktestRows,
} from "./prediction-backtest";
import {
  eloLiveRow,
  isLoggable,
  LOG_WINDOW_HOURS,
  type LogCandidate,
  liveRow,
  type PredictionRow,
  poissonLiveRow,
  RESULT_WINDOW_HOURS,
  type RefreshTarget,
  refreshTargets,
} from "./prediction-log";
import { synchronizeMatches as synchronizeFootballDataMatches } from "./standings-service";
import { getSeasonMatches as getTasoSeasonMatches } from "./taso";
import { synchronizeMatches as synchronizeTasoMatches } from "./taso-standings-service";

const FINISHED_STATUS = "FINISHED";
const HOUR_MS = 60 * 60 * 1000;
/**
 * Rows per insert: 11 columns each, well under Postgres's 65 535 parameters.
 *
 * decisions/052-predictions-log.md
 */
const WRITE_BATCH = 1000;

const TASO_CODES = [...COMPETITIONS.taso];

/**
 * Stored matches of the compared competitions kicking off inside either window.
 *
 * decisions/052-predictions-log.md
 */
async function readCandidates(now: Date): Promise<LogCandidate[]> {
  const from = new Date(now.getTime() - RESULT_WINDOW_HOURS * HOUR_MS);
  const to = new Date(now.getTime() + LOG_WINDOW_HOURS * HOUR_MS);

  const [footballData, taso] = await Promise.all([
    db
      .select({
        code: matches.competitionCode,
        seasonId: matches.seasonId,
        providerMatchId: matches.providerMatchId,
        homeTeam: matches.homeTeamProviderId,
        awayTeam: matches.awayTeamProviderId,
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
        homeTeam: tasoMatches.homeTeamProviderId,
        awayTeam: tasoMatches.awayTeamProviderId,
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
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
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
              homeTeam: row.homeTeam,
              awayTeam: row.awayTeam,
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
 * pages' own staleness check.
 *
 * decisions/052-predictions-log.md
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

/**
 * Upserts rows, one per match, model and kind. The batches are disjoint, and
 * every one started is left to settle before the run fails with whichever
 * failed first.
 *
 * decisions/052-predictions-log.md
 * decisions/571-bounded-database-close.md
 */
async function writePredictions(rows: readonly PredictionRow[]): Promise<void> {
  const failures: unknown[] = [];
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
        .catch((reason: unknown) => {
          failures.push(reason);
        })
    )
  );
  if (failures.length > 0) throw failures[0];
}

/**
 * The run's pacers: football-data at 9 a minute, TASO at 60.
 *
 * decisions/052-predictions-log.md
 */
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
 * One hourly run: refresh what needs it, then log every loggable match. A
 * competition that fails to refresh is still logged from what is stored; one
 * whose baseline fails is skipped. Both are reported.
 *
 * decisions/052-predictions-log.md
 * decisions/053-elo-ratings.md
 * decisions/603-server-side-records.md
 * decisions/055-poisson-goal-model.md
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

  // Read again: the refresh may have moved a kickoff or finished a match.
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

  // The run replays and fits for itself, never from the pages' cache. A failed
  // read costs the Elo and Poisson rows only: the baseline's are still written,
  // and no row is ever made from ratings or strengths that were never read.
  const finished = readFinished();
  const ratings = await finished.then(eloRatingsBySource, (error: unknown) => {
    logger.error({ err: error }, "Unable to read the Elo history for predictions");
    failures.push("elo ratings");
    return null;
  });
  const fits = await finished
    .then((matches) => poissonFitsBySource(matches, utcDay(startedAt)))
    .catch((error: unknown) => {
      logger.error({ err: error }, "Unable to fit the Poisson model for predictions");
      failures.push("poisson strengths");
      return null;
    });

  // Read again: pacing the refreshes can take minutes, and a match that kicked
  // off in the meantime must not be written.
  const writtenAt = clock();
  const rows = candidates
    .filter((candidate) => isLoggable(candidate, writtenAt))
    .flatMap((candidate) => {
      const baseline = baselines.get(keyOf(candidate));
      if (baseline === undefined) return [];
      return [
        liveRow(candidate, baseline, HOME_BASELINE_MODEL, writtenAt),
        ratings === null
          ? null
          : eloLiveRow(candidate, ratings[candidate.source], baseline, writtenAt),
        fits === null ? null : poissonLiveRow(candidate, fits[candidate.source], writtenAt),
      ].filter((row) => row !== null);
    });

  await writePredictions(rows);
  const report = {
    refreshed: targets.length - refreshFailures.length,
    logged: rows.length,
    failures,
  };
  logger.info(report, "Predictions run finished");
  return report;
}

/**
 * Each provider's current Elo ratings, replayed apart: the id spaces never meet.
 *
 * decisions/053-elo-ratings.md
 */
function eloRatingsBySource(
  finished: readonly FinishedMatch[]
): Record<MatchSource["kind"], ReadonlyMap<number, TeamRating>> {
  const ratingsOf = (source: MatchSource["kind"]) =>
    replayElo(finished.filter((match) => match.source === source)).ratings;
  return { "football-data": ratingsOf("football-data"), taso: ratingsOf("taso") };
}

/**
 * Each provider's Poisson fit as it stands on `day`, fitted apart: the id
 * spaces never meet.
 *
 * decisions/055-poisson-goal-model.md
 */
function poissonFitsBySource(
  finished: readonly FinishedMatch[],
  day: number
): Record<MatchSource["kind"], PoissonFit> {
  const fitOf = (source: MatchSource["kind"]) =>
    fitPoisson(
      finished.filter((match) => match.source === source),
      day
    );
  return { "football-data": fitOf("football-data"), taso: fitOf("taso") };
}

/**
 * Every stored finished match of the compared competitions, its score after
 * extra time, with its teams and season: of both providers unless told which.
 * The backtests, the live ratings and fits, and the pages' all read it.
 *
 * decisions/052-predictions-log.md
 * decisions/053-elo-ratings.md
 * decisions/055-poisson-goal-model.md
 */
export async function readFinished(
  sources: ReadonlySet<MatchSource["kind"]> = new Set(["football-data", "taso"])
): Promise<FinishedMatch[]> {
  const [footballData, taso] = await Promise.all([
    !sources.has("football-data")
      ? []
      : db
          .select({
            code: matches.competitionCode,
            seasonId: matches.seasonId,
            providerMatchId: matches.providerMatchId,
            kickoffAt: matches.kickoffAt,
            homeTeam: matches.homeTeamProviderId,
            awayTeam: matches.awayTeamProviderId,
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
    !sources.has("taso")
      ? []
      : db
          .select({
            competitionId: tasoMatches.competitionCode,
            categoryId: tasoMatches.categoryId,
            seasonId: tasoMatches.seasonId,
            providerMatchId: tasoMatches.providerMatchId,
            kickoffAt: tasoMatches.kickoffAt,
            homeTeam: tasoMatches.homeTeamProviderId,
            awayTeam: tasoMatches.awayTeamProviderId,
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
        : [{ source: "taso" as const, code, seasonId, homeGoals, awayGoals, ...row }];
    }),
  ];
}

/**
 * The backtest: one `backtest` row for every stored finished match with
 * history, written idempotently. Stored rows only, no provider request.
 *
 * decisions/052-predictions-log.md
 */
export async function runPredictionBacktest(now: Date = new Date()): Promise<number> {
  const finished = await readFinished();
  const baseline = backtestRows(finished, HOME_BASELINE_MODEL, now);
  const rows = [
    ...baseline,
    ...eloBacktestRows(finished, baseline, now),
    ...poissonBacktestRows(finished, now),
  ];
  await writePredictions(rows);
  return rows.length;
}
