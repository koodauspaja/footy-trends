import { logger } from "./logger";
import type { MatchSource } from "./match-source";
import { getSeasonMovements } from "./standings-service";
import { type TableVolatilitySeries, volatilitySeries } from "./table-volatility";
import { getTasoSeasonMovements } from "./taso-standings-service";

/**
 * A competition's table movement in each completed season, for its standings
 * page, or `error`: a failed read is its own case, never "too few". Each
 * provider reads its own stored seasons.
 *
 * decisions/050-table-volatility.md
 */
export async function getTableVolatility(
  kind: MatchSource["kind"],
  code: string,
  activeSeasonId: number
): Promise<TableVolatilitySeries> {
  try {
    const seasons =
      kind === "football-data"
        ? await getSeasonMovements(code, activeSeasonId)
        : await getTasoSeasonMovements(code, activeSeasonId);
    return volatilitySeries(seasons);
  } catch (error) {
    logger.error({ err: error, code }, "Unable to read the competition's table movement");
    return { status: "error" };
  }
}
