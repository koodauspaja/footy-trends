/**
 * The home-win baseline (specs/051): a competition's own results, read as the
 * chance of a home win, a draw and an away win in its next match — the answer
 * every later model has to beat.
 *
 * Pure: the service reads specs/049's per-season counts for one competition,
 * and this decides which matches get a prediction and sums the counts into one.
 */

import { competitionForSeasonPair } from "./domestic-competitions";
import { COMPETITIONS } from "./goals-per-game";
import type { StoredMatch } from "./match-service";
import type { MatchSource } from "./match-source";
import type { SeasonOutcomes, SeasonRange } from "./outcome-shares";

/**
 * The model's name, as the predictions log (#349) will record it beside each
 * prediction (S10). A change to what the baseline computes is a new version,
 * so a logged prediction always says which rule made it.
 */
export const HOME_BASELINE_MODEL = "home-baseline-v1";

/**
 * The statuses of a match not yet kicked off, on either provider (S3). TASO's
 * normaliser maps its `Fixture` and `Planned` to `SCHEDULED`. Anything in play,
 * finished, postponed, suspended or cancelled gets no prediction.
 */
const UPCOMING: ReadonlySet<string> = new Set(["SCHEDULED", "TIMED"]);

export type HomeBaseline =
  | {
      status: "ok";
      /** Finished matches the shares rest on. */
      matches: number;
      /** 0–100, unrounded. */
      homeShare: number;
      drawShare: number;
      awayShare: number;
      /** The first and last season with a counted match. */
      seasons: SeasonRange;
      /** Whether the competition's seasons run across two calendar years, as `2024/25`. */
      spansCalendarYears: boolean;
    }
  /** No finished match stored (S9, S11). */
  | { status: "empty" }
  | { status: "error" };

/**
 * The competition a match is predicted from, or `null` when it gets no
 * prediction: not upcoming (S3), or not in specs/049 S6's set (S5).
 *
 * A TASO match is filed by its `(competition_id, category_id)` pair, the rule
 * specs/049 counts the history by, so the prediction and its history are the
 * same competition. A national-team match matches no pair and gets none.
 */
export function baselineCompetition(
  stored: StoredMatch
): { kind: MatchSource["kind"]; code: string } | null {
  if (!UPCOMING.has(stored.match.status)) return null;

  if (stored.source === "football-data") {
    const code = stored.match.competitionCode;
    return COMPETITIONS["football-data"].has(code) ? { kind: "football-data", code } : null;
  }

  const { competitionCode, categoryId, seasonId } = stored.match;
  const code = competitionForSeasonPair(
    [...COMPETITIONS.taso],
    competitionCode,
    categoryId,
    seasonId
  );
  return code === null ? null : { kind: "taso", code };
}

/**
 * One competition's seasons summed into three shares (S1, S2). A season with no
 * finished match — next season's fixtures, already published — adds nothing
 * and does not widen the range the explanation line names.
 */
export function homeBaseline(
  seasons: readonly SeasonOutcomes[]
): Exclude<HomeBaseline, { status: "error" }> {
  const played = seasons.filter((season) => season.matches > 0);
  if (played.length === 0) return { status: "empty" };

  const sum = (count: (season: SeasonOutcomes) => number) =>
    played.reduce((total, season) => total + count(season), 0);
  const matches = sum((season) => season.matches);
  const share = (count: number) => (count / matches) * 100;
  const seasonIds = played.map((season) => season.seasonId);

  return {
    status: "ok",
    matches,
    homeShare: share(sum((season) => season.homeWins)),
    drawShare: share(sum((season) => season.draws)),
    awayShare: share(sum((season) => season.awayWins)),
    seasons: { first: Math.min(...seasonIds), last: Math.max(...seasonIds) },
    spansCalendarYears: played.some((season) => season.spansCalendarYears),
  };
}
