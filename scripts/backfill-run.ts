/**
 * The work of the backfill: walks every competition-season for both providers,
 * paced to their rate limits, and stores results through the existing sync path.
 *
 * Imported dynamically by `backfill.ts`, after the target database has been
 * settled — importing `src/db` fixes the connection, so nothing here may be
 * loaded before then.
 */
import { and, eq, sql } from "drizzle-orm";
import { closeDatabase, db } from "../src/db";
import { matches, tasoGroupTeams, tasoMatches } from "../src/db/schema";
import { SUPPORTED_COMPETITIONS } from "../src/lib/competitions";
import {
  categoryIdForSeason,
  competitionIdForSeason,
  DOMESTIC_COMPETITIONS,
  earliestSeasonFor as tasoEarliestSeasonFor,
} from "../src/lib/domestic-competitions";
import {
  getSeasonMatches as getFootballDataMatches,
  getSeasonContext,
} from "../src/lib/football-data";
import { redis } from "../src/lib/redis";
import { synchronizeMatches as synchronizeFootballDataMatches } from "../src/lib/standings-service";
import {
  getCurrentSeason,
  getSeasonGroups,
  getSeasonMatches as getTasoMatches,
  normalizeGroupTeams,
} from "../src/lib/taso";
import {
  synchronizeGroupTeams,
  synchronizeMatches as synchronizeTasoMatches,
} from "../src/lib/taso-standings-service";
import {
  canSkip,
  delayBefore,
  describeError,
  intervalForRatePerMinute,
  tasoSeasonsFor,
} from "./backfill-plan";

const out = (line = ""): void => void process.stdout.write(`${line}\n`);
const err = (line = ""): void => void process.stderr.write(`${line}\n`);

// 90% of football-data.org's documented 10/minute (docs/setup/007). TASO
// publishes no limit, so there is no maximum to take a percentage of; 1/second
// is well under what /kotimaa page views already ask of it in normal use.
const FOOTBALL_DATA_PER_MINUTE = 9;
const TASO_PER_MINUTE = 60;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Spaces one provider's requests, independently of the other's. */
function pacer(perMinute: number) {
  const interval = intervalForRatePerMinute(perMinute);
  let lastAt: number | null = null;
  return async function paced<T>(work: () => Promise<T>): Promise<T> {
    const wait = delayBefore(lastAt, Date.now(), interval);
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    return work();
  };
}

/** Rows already stored for one football-data competition-season. */
async function alreadyStored(
  competitionCode: string,
  seasonId: number,
  currentSeason: number
): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(matches)
    .where(and(eq(matches.competitionCode, competitionCode), eq(matches.seasonId, seasonId)));
  return canSkip(row?.n ?? 0, seasonId, currentSeason);
}

/** The same question for TASO, which is keyed by category rather than code. */
async function alreadyStoredTaso(
  categoryId: string,
  seasonId: number,
  currentSeason: number
): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasoMatches)
    .where(and(eq(tasoMatches.categoryId, categoryId), eq(tasoMatches.seasonId, seasonId)));
  return canSkip(row?.n ?? 0, seasonId, currentSeason);
}

/**
 * The same question for a season's group snapshot.
 *
 * Asked separately from the matches because the two are separate writes: a
 * season whose matches stored and whose groups then failed would otherwise be
 * skipped for ever, its group data never retried, because the season "has rows".
 */
async function alreadyStoredTasoGroups(
  categoryId: string,
  seasonId: number,
  currentSeason: number
): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasoGroupTeams)
    .where(and(eq(tasoGroupTeams.categoryId, categoryId), eq(tasoGroupTeams.seasonId, seasonId)));
  return canSkip(row?.n ?? 0, seasonId, currentSeason);
}

export async function backfill({ reset }: { reset: boolean }): Promise<number> {
  out(`Rates        football-data ${FOOTBALL_DATA_PER_MINUTE}/min, TASO ${TASO_PER_MINUTE}/min`);

  let failures = 0;
  let skipped = 0;
  const startedAt = Date.now();

  try {
    // One round trip before any provider is called. Without it, an unreachable
    // database still costs a full run: every competition-season is fetched, at
    // the providers' pace, and then fails to store — eleven minutes and 329
    // requests of rate limit spent to discover the database was never there.
    try {
      await db.execute(sql`SELECT 1`);
    } catch (error) {
      err(`Cannot reach the database: ${describeError(error)}`);
      return 1;
    }

    if (reset) {
      out("\nResetting — deleting every row in matches, taso_matches, taso_group_teams");
      // One transaction, so a reset is all or nothing. Three separate deletes
      // would leave the database partly emptied if the second or third failed,
      // and the run aborts on that failure — turning a deliberate clean start
      // into destroyed data with nothing put back.
      await db.transaction(async (tx) => {
        await tx.delete(matches);
        await tx.delete(tasoMatches);
        await tx.delete(tasoGroupTeams);
      });
      out("Reset done.");
    }

    const footballData = pacer(FOOTBALL_DATA_PER_MINUTE);
    const taso = pacer(TASO_PER_MINUTE);

    out(`\n=== football-data.org: ${SUPPORTED_COMPETITIONS.length} competitions ===`);
    for (const competition of SUPPORTED_COMPETITIONS) {
      let seasons: number[];
      // The provider's own view of which season is being played, rather than
      // the calendar year: it is what decides whether a season is finished and
      // therefore skippable, and football-data's seasons straddle years.
      let activeSeason: number;
      try {
        const context = await footballData(() => getSeasonContext(competition.code));
        seasons = context.selectableSeasons.map((season) => season.seasonId);
        activeSeason = context.activeSeasonId;
      } catch (error) {
        failures += 1;
        err(`  ${competition.code}: no season context — ${describeError(error)}`);
        continue;
      }

      for (const seasonId of seasons) {
        try {
          if (await alreadyStored(competition.code, seasonId, activeSeason)) {
            skipped += 1;
            out(`  ${competition.code} ${seasonId}: already stored, skipped`);
            continue;
          }
          const providerMatches = await footballData(() =>
            getFootballDataMatches(competition.code, seasonId)
          );
          await synchronizeFootballDataMatches(providerMatches);
          out(`  ${competition.code} ${seasonId}: ${providerMatches.length} matches`);
        } catch (error) {
          failures += 1;
          err(`  ${competition.code} ${seasonId}: FAILED — ${describeError(error)}`);
        }
      }
    }

    out(`\n=== TASO: ${DOMESTIC_COMPETITIONS.length} competitions ===`);

    // The current season comes from the provider, not the clock (#219).
    // `new Date().getUTCFullYear()` contradicted spec 011, and the two
    // disagree whenever TASO publishes the next season before January or runs
    // the current one past it. That value decides which seasons are fetched
    // and, through `canSkip`, which count as finished — so a disagreement can
    // skip a season that is still gaining matches.
    //
    // `getCurrentSeason` rather than `resolveTasoSeasonContext`, which the app
    // uses: that also computes `defaultSeason`, and answering "does this season
    // have matches" means *syncing* the season. Thirteen of those turns a
    // discovery step into a second backfill. Discovery itself is
    // competition-agnostic (spec 011), so this is one request for the whole
    // loop, floored per competition below exactly as the app floors it.
    const discovered = await taso(() => getCurrentSeason());
    if (discovered === null) {
      failures += 1;
      err(
        "  TASO season discovery failed. Refusing to guess the current season — " +
          "backfilling the wrong range is worse than not backfilling. Re-run when TASO answers."
      );
    }

    for (const competition of DOMESTIC_COMPETITIONS) {
      if (discovered === null) break;
      // Floored at the competition's own first season, the same way
      // `resolveTasoSeasonContext` floors it: Ykkösliiga did not exist before
      // 2024, and a ceiling below its floor would produce no seasons at all.
      const currentTasoSeason = Math.max(discovered, tasoEarliestSeasonFor(competition.code));
      const seasons = tasoSeasonsFor(tasoEarliestSeasonFor(competition.code), currentTasoSeason);
      for (const seasonId of seasons) {
        // `competitionIdForSeason`, not taso.ts's `competitionIdFromSeason`:
        // most competitions sit under the season umbrella (`spljp26`), but one
        // that declares its own prefix does not (`M1LCUP26`). The generic one
        // asks TASO about a competition that does not exist there, and TASO
        // answers with an empty list rather than an error — so the run reports
        // success having stored nothing.
        const competitionId = competitionIdForSeason(competition.code, seasonId);
        const categoryId = categoryIdForSeason(competition.code, seasonId);
        try {
          // Two questions, not one. Matches and groups are separate writes, so a
          // season whose matches stored and whose groups then failed must still
          // retry the groups — a single season-level skip would strand them.
          const hasMatches = await alreadyStoredTaso(categoryId, seasonId, currentTasoSeason);
          const hasGroups = await alreadyStoredTasoGroups(categoryId, seasonId, currentTasoSeason);

          if (hasMatches && hasGroups) {
            skipped += 1;
            out(`  ${competition.code} ${seasonId}: already stored, skipped`);
            continue;
          }

          let matchCount = "skipped";
          if (!hasMatches) {
            const providerMatches = await taso(() =>
              getTasoMatches(competitionId, categoryId, seasonId)
            );
            await synchronizeTasoMatches(providerMatches);
            matchCount = `${providerMatches.length} matches`;
          }

          let groupCount = "skipped";
          if (!hasGroups) {
            const groups = await taso(() => getSeasonGroups(competitionId, categoryId));
            const teams = normalizeGroupTeams(groups, categoryId, competitionId, seasonId);
            await synchronizeGroupTeams(categoryId, competitionId, seasonId, teams);
            groupCount = `${teams.length} group rows`;
          }

          out(`  ${competition.code} ${seasonId}: ${matchCount}, ${groupCount}`);
        } catch (error) {
          failures += 1;
          err(`  ${competition.code} ${seasonId}: FAILED — ${describeError(error)}`);
        }
      }
    }
  } finally {
    // Settled together, not awaited in sequence: a rejection from the first
    // would skip the second and escape the function, so a run that fetched
    // everything successfully would print no summary and return no exit code
    // because a socket failed to close. Cleanup cannot be allowed to decide
    // whether the backfill succeeded.
    for (const result of await Promise.allSettled([closeDatabase(), redis.quit()])) {
      if (result.status === "rejected") err(`  cleanup: ${describeError(result.reason)}`);
    }
  }

  const minutes = ((Date.now() - startedAt) / 60_000).toFixed(1);
  out(
    `\nFinished in ${minutes} min with ${failures} failure(s), ${skipped} already stored and skipped.`
  );
  // A partial run is re-runnable: every write is an upsert, so repeating it
  // costs requests rather than correctness.
  return failures === 0 ? 0 : 1;
}
