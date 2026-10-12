/**
 * A competition's season forecast for its standings page: the tables and
 * remaining fixtures read as the page reads them, each fixture predicted from
 * the provider's cached Poisson fit, cached in Redis for 15 minutes. The
 * simulation itself is `season-simulation.ts`.
 *
 * decisions/061-season-simulation.md
 */

import { getCachedUnlessDegraded } from "./cache";
import { categoryIdForSeason, competitionIdForSeason } from "./domestic-competitions";
import { logger } from "./logger";
import type { MatchSource } from "./match-source";
import { predictPoisson } from "./poisson";
import { getPoissonFit } from "./poisson-service";
import {
  type ForecastLayout,
  isRemainingFixture,
  type SeasonForecast,
  type SeasonTableInput,
  seasonForecast,
} from "./season-simulation";
import { calculateStandings, toFinishedMatches } from "./standings";
import { getLeagueSeasonMatches } from "./standings-service";
import { hasTableVolatility } from "./table-volatility";
import { getSeasonTables, hasCarryOver } from "./taso-standings-service";

/**
 * As long as the table's and the fit's own caches.
 *
 * decisions/061-season-simulation.md
 */
const FORECAST_CACHE_TTL_SECONDS = 15 * 60;

/**
 * football-data's stage for a league's own matches; older rows carry none.
 *
 * decisions/061-season-simulation.md
 */
const REGULAR_SEASON = "REGULAR_SEASON";

/**
 * A season's tables and fixtures, or null when nothing is stored. `stale`
 * when the provider could not be asked and stored rows were served.
 *
 * decisions/061-season-simulation.md
 */
type SeasonRead = { layout: ForecastLayout; tables: SeasonTableInput[]; stale: boolean } | null;

type Sides = { homeTeamProviderId: number; awayTeamProviderId: number };

function fixtureOf(match: Sides) {
  return { homeTeam: match.homeTeamProviderId, awayTeam: match.awayTeamProviderId };
}

async function footballDataSeason(
  code: string,
  seasonId: number,
  activeSeasonId: number
): Promise<SeasonRead> {
  const { matches, refreshFailed } = await getLeagueSeasonMatches(code, seasonId, activeSeasonId);
  // A league's play-offs are stored under its code: neither in the table nor played out.
  const regular = matches.filter((match) => (match.stage ?? REGULAR_SEASON) === REGULAR_SEASON);
  if (regular.length === 0) {
    if (refreshFailed) throw new Error("The season's matches could not be read");
    return null;
  }

  return {
    layout: "single",
    stale: refreshFailed,
    tables: [
      {
        groupName: null,
        simulated: true,
        rows: calculateStandings(toFinishedMatches(regular), regular),
        fixtures: regular.filter(isRemainingFixture).map(fixtureOf),
      },
    ],
  };
}

async function tasoSeason(
  code: string,
  seasonId: number,
  activeSeasonId: number
): Promise<SeasonRead> {
  const season = await getSeasonTables(
    categoryIdForSeason(code, seasonId),
    competitionIdForSeason(code, seasonId),
    seasonId,
    activeSeasonId
  );
  if (season.status !== "ok") {
    if (season.status === "error") throw new Error("The season's tables could not be read");
    return null;
  }

  // A group others carry points over from has been continued: its teams are in those.
  const continued = new Set(season.tables.map((table) => table.parentGroupId));
  const tabled = season.tables.filter((table) => table.kind !== "match-list");
  const splitLastSeason = hasCarryOver(
    categoryIdForSeason(code, seasonId - 1),
    competitionIdForSeason(code, seasonId - 1)
  );
  const hasSplit = season.tables.some((table) => table.parentGroupId !== null);
  // Counted with the continued group: a season that has split is never a single table.
  let layout: ForecastLayout = tabled.length === 1 ? "single" : "several";
  if (!hasSplit && splitLastSeason) layout = "before-split";

  return {
    layout,
    stale: season.refreshFailed,
    tables: tabled
      .filter((table) => !continued.has(table.groupId))
      .map((table) => ({
        groupName: table.groupName,
        simulated: table.kind === "own-calculated",
        rows: table.standings,
        fixtures: table.matches.filter(isRemainingFixture).map(fixtureOf),
      })),
  };
}

/**
 * The forecast of a covered league's season in progress, or why there is
 * none. `unavailable` is no panel: another season, a competition outside the
 * leagues, nothing stored, or a competition the fit has no match of.
 *
 * decisions/061-season-simulation.md
 */
export async function getSeasonForecast(
  kind: MatchSource["kind"],
  code: string,
  seasonId: number,
  activeSeasonId: number
): Promise<SeasonForecast> {
  // The leagues are the competitions with a table-movement panel.
  if (seasonId !== activeSeasonId || !hasTableVolatility(kind, code)) {
    return { status: "unavailable" };
  }

  try {
    return await getCachedUnlessDegraded(
      `forecast:v1:${kind}:${code}:${seasonId}`,
      FORECAST_CACHE_TTL_SECONDS,
      async (): Promise<{ value: SeasonForecast; degraded: boolean }> => {
        const [fitted, season] = await Promise.all([
          getPoissonFit(kind),
          kind === "football-data"
            ? footballDataSeason(code, seasonId, activeSeasonId)
            : tasoSeason(code, seasonId, activeSeasonId),
        ]);
        if (fitted.status === "error") throw new Error("The Poisson fit could not be read");
        const { fit } = fitted;
        if (season === null || !fit.competitions.has(code)) {
          return { value: { status: "unavailable" }, degraded: season?.stale ?? false };
        }

        return {
          value: seasonForecast(season.layout, season.tables, (homeTeam, awayTeam) =>
            predictPoisson(fit, code, homeTeam, awayTeam)
          ),
          degraded: season.stale,
        };
      }
    );
  } catch (error) {
    logger.error({ err: error, source: kind, code, seasonId }, "Unable to simulate the season");
    return { status: "error" };
  }
}
