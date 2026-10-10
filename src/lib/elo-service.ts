/**
 * Elo ratings for the pages: one replay per provider, cached in
 * Redis for 15 minutes. The hourly run and the backtest never read this
 * cache — they replay for themselves.
 *
 * decisions/053-elo-ratings.md
 */

import { getCached } from "./cache";
import { replayElo, type TeamRating } from "./elo";
import { logger } from "./logger";
import type { MatchSource } from "./match-source";
import { readFinished } from "./prediction-log-service";

/**
 * As long as the providers' own response cache.
 *
 * decisions/053-elo-ratings.md
 */
const ELO_CACHE_TTL_SECONDS = 15 * 60;

/**
 * What the cache holds per provider: JSON-safe, and small — each team's
 * history as `[seasonId, rating]` pairs, the rating to one decimal.
 *
 * decisions/053-elo-ratings.md
 */
type EloSnapshot = {
  ratings: Array<[number, TeamRating]>;
  history: Array<[number, Array<[number, number]>]>;
};

export type EloRatings =
  | { status: "ok"; ratings: ReadonlyMap<number, TeamRating> }
  | { status: "error" };

/**
 * A team's rating after each of its matches, oldest first.
 *
 * decisions/053-elo-ratings.md
 */
export type TeamEloSeries =
  | { status: "ok"; points: Array<{ seasonId: number; rating: number }> }
  /** The team played none of the covered competitions. */
  | { status: "empty" }
  | { status: "error" };

function cacheKey(source: MatchSource["kind"]): string {
  return `elo:v1:${source}`;
}

const roundToTenth = (value: number) => Math.round(value * 10) / 10;

async function snapshot(source: MatchSource["kind"]): Promise<EloSnapshot> {
  return getCached(cacheKey(source), ELO_CACHE_TTL_SECONDS, async () => {
    const { ratings, history } = replayElo(await readFinished(new Set([source])));
    return {
      ratings: [...ratings],
      history: [...history].map(([team, points]) => [
        team,
        points.map((point): [number, number] => [point.seasonId, roundToTenth(point.rating)]),
      ]),
    };
  });
}

/**
 * Every team's current rating on one provider, for the match page.
 *
 * decisions/053-elo-ratings.md
 */
export async function getEloRatings(source: MatchSource["kind"]): Promise<EloRatings> {
  try {
    return { status: "ok", ratings: new Map((await snapshot(source)).ratings) };
  } catch (error) {
    logger.error({ err: error, source }, "Unable to read the Elo ratings");
    return { status: "error" };
  }
}

/**
 * One team's rating history, for the team page's chart.
 *
 * decisions/053-elo-ratings.md
 */
export async function getTeamElo(
  source: MatchSource["kind"],
  team: number
): Promise<TeamEloSeries> {
  try {
    const history = (await snapshot(source)).history.find(([id]) => id === team)?.[1];
    if (history === undefined) return { status: "empty" };
    return {
      status: "ok",
      points: history.map(([seasonId, rating]) => ({ seasonId, rating })),
    };
  } catch (error) {
    logger.error({ err: error, source, team }, "Unable to read the team's Elo history");
    return { status: "error" };
  }
}
