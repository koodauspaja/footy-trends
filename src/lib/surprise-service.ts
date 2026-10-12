/**
 * Elo's backtest predictions read against the results: a competition-season's
 * biggest surprises, and one match's figure. Every figure is computed by
 * `surprise.ts`; this reads.
 *
 * decisions/057-surprise-index.md
 */

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, predictions, tasoMatches } from "@/db/schema";
import { ELO_MODEL } from "./elo";
import { logger } from "./logger";
import {
  FOOTBALL_DATA_AWAY_GOALS,
  FOOTBALL_DATA_HOME_GOALS,
  getFirstStoredSeason,
  type StoredMatch,
} from "./match-service";
import type { MatchSource } from "./match-source";
import {
  isFirstStoredSeason,
  type PredictedMatch,
  type SeasonSurprises,
  seasonSurprises,
  surpriseOf,
} from "./surprise";

const FINISHED_STATUS = "FINISHED";
const BACKTEST = "backtest";

const PROBABILITIES = {
  home: predictions.homeProbability,
  draw: predictions.drawProbability,
  away: predictions.awayProbability,
};

/**
 * Elo's backtest rows of one provider's competition.
 *
 * decisions/057-surprise-index.md
 */
function eloBacktestOf(source: MatchSource["kind"], code: string) {
  return and(
    eq(predictions.source, source),
    eq(predictions.competitionCode, code),
    eq(predictions.model, ELO_MODEL),
    eq(predictions.kind, BACKTEST)
  );
}

async function footballDataPredicted(code: string, seasonId: number): Promise<PredictedMatch[]> {
  return db
    .select({
      providerMatchId: matches.providerMatchId,
      kickoffAt: matches.kickoffAt,
      homeTeamProviderId: matches.homeTeamProviderId,
      homeTeamName: matches.homeTeamName,
      awayTeamProviderId: matches.awayTeamProviderId,
      awayTeamName: matches.awayTeamName,
      // After extra time, the shoot-out taken out.
      homeGoals: sql<number>`${FOOTBALL_DATA_HOME_GOALS}`.mapWith(Number),
      awayGoals: sql<number>`${FOOTBALL_DATA_AWAY_GOALS}`.mapWith(Number),
      ...PROBABILITIES,
    })
    .from(predictions)
    .innerJoin(matches, eq(matches.providerMatchId, predictions.providerMatchId))
    .where(
      and(
        eloBacktestOf("football-data", code),
        eq(matches.seasonId, seasonId),
        eq(matches.status, FINISHED_STATUS),
        isNotNull(matches.homeGoals),
        isNotNull(matches.awayGoals)
      )
    );
}

/**
 * A domestic competition's predicted matches, every group of it together: the
 * prediction's own competition code says which competition a row is of.
 *
 * decisions/057-surprise-index.md
 */
async function tasoPredicted(code: string, seasonId: number): Promise<PredictedMatch[]> {
  const rows = await db
    .select({
      providerMatchId: tasoMatches.providerMatchId,
      kickoffAt: tasoMatches.kickoffAt,
      homeTeamProviderId: tasoMatches.homeTeamProviderId,
      homeTeamName: tasoMatches.homeTeamName,
      awayTeamProviderId: tasoMatches.awayTeamProviderId,
      awayTeamName: tasoMatches.awayTeamName,
      homeGoals: tasoMatches.homeGoals,
      awayGoals: tasoMatches.awayGoals,
      ...PROBABILITIES,
    })
    .from(predictions)
    .innerJoin(tasoMatches, eq(tasoMatches.providerMatchId, predictions.providerMatchId))
    .where(
      and(
        eloBacktestOf("taso", code),
        eq(tasoMatches.seasonId, seasonId),
        eq(tasoMatches.status, FINISHED_STATUS),
        isNotNull(tasoMatches.homeGoals),
        isNotNull(tasoMatches.awayGoals)
      )
    );
  // Both scores are non-null by the query; the filter narrows the type.
  return rows.flatMap(({ homeGoals, awayGoals, ...row }) =>
    homeGoals === null || awayGoals === null ? [] : [{ ...row, homeGoals, awayGoals }]
  );
}

/**
 * A competition-season's biggest surprises, or why there is no list. The
 * competition's first stored season is answered without reading a prediction.
 *
 * decisions/057-surprise-index.md
 */
export async function getSeasonSurprises(
  kind: MatchSource["kind"],
  code: string,
  seasonId: number,
  activeSeasonId: number
): Promise<SeasonSurprises> {
  try {
    if (isFirstStoredSeason(seasonId, await getFirstStoredSeason(kind, code))) {
      return { status: "first-season" };
    }
    const predicted =
      kind === "football-data"
        ? await footballDataPredicted(code, seasonId)
        : await tasoPredicted(code, seasonId);
    return seasonSurprises(predicted, seasonId === activeSeasonId);
  } catch (error) {
    logger.error(
      { err: error, source: kind, code, seasonId },
      "Unable to read the season's surprises"
    );
    return { status: "error" };
  }
}

/**
 * A stored match's final score, the shoot-out taken out, or null when it is
 * not finished with both scores.
 *
 * decisions/049-home-advantage-and-draw-rate.md
 * decisions/057-surprise-index.md
 */
function finalScore(stored: StoredMatch): { homeGoals: number; awayGoals: number } | null {
  const { homeGoals, awayGoals, status } = stored.match;
  if (status !== FINISHED_STATUS || homeGoals === null || awayGoals === null) return null;
  if (stored.source === "taso") return { homeGoals, awayGoals };

  const { penaltiesHome, penaltiesAway } = stored.match;
  return penaltiesHome === null || penaltiesAway === null
    ? { homeGoals, awayGoals }
    : { homeGoals: homeGoals - penaltiesHome, awayGoals: awayGoals - penaltiesAway };
}

/**
 * The probability Elo's backtest gave a finished match's result, 0–1, or null:
 * not finished, drawn, without an Elo row, or unreadable.
 *
 * decisions/057-surprise-index.md
 */
export async function getMatchSurprise(stored: StoredMatch): Promise<number | null> {
  const score = finalScore(stored);
  // A draw has no figure, so nothing is read for one.
  if (score === null || score.homeGoals === score.awayGoals) return null;

  const { providerMatchId } = stored.match;
  try {
    const [row] = await db
      .select(PROBABILITIES)
      .from(predictions)
      .where(
        and(
          eq(predictions.source, stored.source),
          eq(predictions.providerMatchId, providerMatchId),
          eq(predictions.model, ELO_MODEL),
          eq(predictions.kind, BACKTEST)
        )
      )
      .limit(1);
    return row === undefined ? null : surpriseOf({ ...score, ...row });
  } catch (error) {
    logger.error(
      { err: error, source: stored.source, providerMatchId },
      "Unable to read the match's surprise"
    );
    return null;
  }
}
