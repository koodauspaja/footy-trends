/**
 * The Poisson fit for the pages: one fit per provider, cached in Redis for 15
 * minutes. The hourly run and the backtest never read this cache — they fit
 * for themselves.
 *
 * decisions/055-poisson-goal-model.md
 */

import { getCached } from "./cache";
import { logger } from "./logger";
import type { MatchSource } from "./match-source";
import { fitPoisson, type PoissonFit, utcDay } from "./poisson";
import { readFinished } from "./prediction-log-service";

/**
 * As long as the providers' own response cache.
 *
 * decisions/055-poisson-goal-model.md
 */
const POISSON_CACHE_TTL_SECONDS = 15 * 60;

/**
 * What the cache holds per provider: the fit, its maps as JSON-safe pairs.
 *
 * decisions/055-poisson-goal-model.md
 */
type PoissonSnapshot = {
  competitions: Array<[string, { base: number; drawFactor: number }]>;
  home: number;
  attack: Array<[number, number]>;
  defence: Array<[number, number]>;
};

export type PoissonFitResult = { status: "ok"; fit: PoissonFit } | { status: "error" };

/**
 * One provider's fit as it stands today, for the match page.
 *
 * decisions/055-poisson-goal-model.md
 */
export async function getPoissonFit(
  source: MatchSource["kind"],
  clock: () => Date = () => new Date()
): Promise<PoissonFitResult> {
  try {
    const snapshot = await getCached(
      `poisson:v1:${source}`,
      POISSON_CACHE_TTL_SECONDS,
      async (): Promise<PoissonSnapshot> => {
        const fit = fitPoisson(await readFinished(new Set([source])), utcDay(clock()));
        return {
          competitions: [...fit.competitions],
          home: fit.home,
          attack: [...fit.attack],
          defence: [...fit.defence],
        };
      }
    );
    return {
      status: "ok",
      fit: {
        competitions: new Map(snapshot.competitions),
        home: snapshot.home,
        attack: new Map(snapshot.attack),
        defence: new Map(snapshot.defence),
      },
    };
  } catch (error) {
    logger.error({ err: error, source }, "Unable to fit the Poisson model");
    return { status: "error" };
  }
}
