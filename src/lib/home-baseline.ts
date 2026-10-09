/**
 * The home-win baseline: a competition's own results, read as the chance of a
 * home win, a draw and an away win in its next match. Pure: the service reads
 * the per-season counts.
 *
 * decisions/049-home-advantage-and-draw-rate.md
 * decisions/051-home-win-baseline.md
 */

import { competitionForSeasonPair } from "./domestic-competitions";
import { COMPETITIONS } from "./goals-per-game";
import type { StoredMatch } from "./match-service";
import type { MatchSource } from "./match-source";
import type { SeasonOutcomes, SeasonRange } from "./outcome-shares";

/**
 * The model's name, as the predictions log will record it beside each
 * prediction. A change to what the baseline computes is a new version,
 * so a logged prediction always says which rule made it.
 *
 * decisions/051-home-win-baseline.md
 */
export const HOME_BASELINE_MODEL = "home-baseline-v1";

/**
 * The statuses of a match not yet kicked off, on either provider. TASO's
 * normaliser maps its `Fixture` and `Planned` to `SCHEDULED`. Anything in play,
 * finished, postponed, suspended or cancelled gets no prediction.
 *
 * decisions/051-home-win-baseline.md
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
  /** No finished match stored. */
  | { status: "empty" }
  | { status: "error" };

/**
 * The competition a match is predicted from, or `null` when it gets no
 * prediction: not upcoming, or not a compared competition. A TASO match is
 * filed by its `(competition_id, category_id)` pair.
 *
 * decisions/049-home-advantage-and-draw-rate.md
 * decisions/051-home-win-baseline.md
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
 * One competition's seasons summed into three shares. A season with no
 * finished match — next season's fixtures, already published — adds nothing
 * and does not widen the range the explanation line names.
 *
 * decisions/051-home-win-baseline.md
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
