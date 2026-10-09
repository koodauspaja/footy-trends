/**
 * The logged predictions with their results, for `/ennusteet`.
 * Every figure is computed by `prediction-quality.ts`; this reads, and caches.
 *
 * decisions/054-prediction-quality.md
 * decisions/055-poisson-goal-model.md
 */

import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, predictions, tasoMatches } from "@/db/schema";
import { getCached } from "./cache";
import { ELO_MODEL } from "./elo";
import { HOME_BASELINE_MODEL } from "./home-baseline";
import { logger } from "./logger";
import { FOOTBALL_DATA_AWAY_GOALS, FOOTBALL_DATA_HOME_GOALS } from "./match-service";
import type { MatchSource } from "./match-source";
import { POISSON_MODEL } from "./poisson";
import {
  type JudgedPrediction,
  type Outcome,
  type QualityReport,
  qualityReport,
} from "./prediction-quality";

/**
 * The models judged, in the order every figure lists them.
 *
 * decisions/054-prediction-quality.md
 */
export const QUALITY_MODELS = [HOME_BASELINE_MODEL, ELO_MODEL, POISSON_MODEL] as const;

/**
 * The first season judged: domestically 2016, leaving Elo's cold 2015
 * run-in out; football-data from 2023, its stored history's start.
 *
 * decisions/054-prediction-quality.md
 */
export const QUALITY_FIRST_SEASON: Record<MatchSource["kind"], number> = {
  taso: 2016,
  "football-data": 2023,
};

/**
 * Which predictions a page shows.
 *
 * decisions/054-prediction-quality.md
 */
export type PredictionKind = "backtest" | "live";

const FINISHED_STATUS = "FINISHED";
const CACHE_TTL_SECONDS = 15 * 60;

export type QualityResult = QualityReport | { status: "error" };

/**
 * Where one provider's and kind's report is cached.
 *
 * decisions/054-prediction-quality.md
 * decisions/055-poisson-goal-model.md
 */
export function qualityCacheKey(source: MatchSource["kind"], kind: PredictionKind): string {
  return `quality:v2:${source}:${kind}`;
}

function outcomeOf(home: number, away: number): Outcome {
  if (home > away) return "home";
  return home === away ? "draw" : "away";
}

type Row = {
  model: string;
  providerMatchId: number;
  seasonId: number;
  kickoffAt: Date;
  home: number;
  draw: number;
  away: number;
  homeGoals: number;
  awayGoals: number;
};

/**
 * One provider's judged predictions of one kind, inside the window.
 *
 * decisions/054-prediction-quality.md
 * decisions/049-home-advantage-and-draw-rate.md
 */
async function readJudged(source: MatchSource["kind"], kind: PredictionKind): Promise<Row[]> {
  const logged = and(
    eq(predictions.source, source),
    eq(predictions.kind, kind),
    inArray(predictions.model, [...QUALITY_MODELS])
  );
  const probabilities = {
    model: predictions.model,
    providerMatchId: predictions.providerMatchId,
    home: predictions.homeProbability,
    draw: predictions.drawProbability,
    away: predictions.awayProbability,
  };
  if (source === "football-data") {
    return db
      .select({
        ...probabilities,
        seasonId: matches.seasonId,
        kickoffAt: matches.kickoffAt,
        // After extra time, the shoot-out taken out.
        homeGoals: sql<number>`${FOOTBALL_DATA_HOME_GOALS}`.mapWith(Number),
        awayGoals: sql<number>`${FOOTBALL_DATA_AWAY_GOALS}`.mapWith(Number),
      })
      .from(predictions)
      .innerJoin(matches, eq(matches.providerMatchId, predictions.providerMatchId))
      .where(
        and(
          logged,
          eq(matches.status, FINISHED_STATUS),
          isNotNull(matches.homeGoals),
          isNotNull(matches.awayGoals),
          gte(matches.seasonId, QUALITY_FIRST_SEASON[source])
        )
      );
  }
  const rows = await db
    .select({
      ...probabilities,
      seasonId: tasoMatches.seasonId,
      kickoffAt: tasoMatches.kickoffAt,
      homeGoals: tasoMatches.homeGoals,
      awayGoals: tasoMatches.awayGoals,
    })
    .from(predictions)
    .innerJoin(tasoMatches, eq(tasoMatches.providerMatchId, predictions.providerMatchId))
    .where(
      and(
        logged,
        eq(tasoMatches.status, FINISHED_STATUS),
        isNotNull(tasoMatches.homeGoals),
        isNotNull(tasoMatches.awayGoals),
        gte(tasoMatches.seasonId, QUALITY_FIRST_SEASON[source])
      )
    );
  // Both scores are non-null by the query; the filter narrows the type.
  return rows.flatMap(({ homeGoals, awayGoals, ...row }) =>
    homeGoals === null || awayGoals === null ? [] : [{ ...row, homeGoals, awayGoals }]
  );
}

/**
 * One provider's and kind's report, cached 15 minutes, or `error`.
 *
 * decisions/054-prediction-quality.md
 */
export async function getPredictionQuality(
  source: MatchSource["kind"],
  kind: PredictionKind
): Promise<QualityResult> {
  try {
    return await getCached(qualityCacheKey(source, kind), CACHE_TTL_SECONDS, async () => {
      const judged: JudgedPrediction[] = (await readJudged(source, kind)).map(
        ({ homeGoals, awayGoals, ...row }) => ({ ...row, outcome: outcomeOf(homeGoals, awayGoals) })
      );
      return qualityReport(judged, QUALITY_MODELS);
    });
  } catch (error) {
    logger.error({ err: error, source, kind }, "Unable to read the prediction quality");
    return { status: "error" };
  }
}
