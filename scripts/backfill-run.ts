/**
 * The work of the backfill: walks every competition-season for both providers,
 * paced to their rate limits, and stores results through the existing sync
 * path. Loaded only after the target database has been settled.
 *
 * decisions/169-production-backfill.md
 * decisions/292-sonar-zero-open-issues.md
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
import { createPacer, FOOTBALL_DATA_PER_MINUTE, TASO_PER_MINUTE } from "../src/lib/pacer";
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
import { canSkip, describeError, tasoSeasonsFor } from "./backfill-plan";

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}
function err(line = ""): void {
  process.stderr.write(`${line}\n`);
}

/**
 * Rows already stored for one football-data competition-season.
 *
 * decisions/169-production-backfill.md
 */
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

/**
 * The same question for TASO, which is keyed by category, not code.
 *
 * decisions/169-production-backfill.md
 */
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
 * The same question for a season's group snapshot, asked separately because
 * the groups are a separate write.
 *
 * decisions/169-production-backfill.md
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

/**
 * How much of one half of the run failed, and how much it did not have to do.
 *
 * decisions/292-sonar-zero-open-issues.md
 */
type HalfResult = { failures: number; skipped: number };

/**
 * The football-data half.
 *
 * decisions/169-production-backfill.md
 * decisions/292-sonar-zero-open-issues.md
 */
async function backfillFootballData(
  footballData: <T>(work: () => Promise<T>) => Promise<T>,
  refetch: boolean
): Promise<HalfResult> {
  let failures = 0;
  let skipped = 0;

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
        if (!refetch && (await alreadyStored(competition.code, seasonId, activeSeason))) {
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

  return { failures, skipped };
}

/**
 * What one competition-season did, for the counters the caller keeps.
 *
 * decisions/292-sonar-zero-open-issues.md
 */
type SeasonOutcome = "stored" | "skipped" | "failed";

/**
 * One TASO competition-season: its matches, its groups, or the reason neither
 * was needed.
 *
 * decisions/169-production-backfill.md
 * decisions/292-sonar-zero-open-issues.md
 */
async function backfillTasoSeason(
  taso: <T>(work: () => Promise<T>) => Promise<T>,
  code: string,
  seasonId: number,
  currentTasoSeason: number,
  refetch: boolean
): Promise<SeasonOutcome> {
  // `competitionIdForSeason`, not the bare season umbrella: a competition that
  // declares its own prefix (`M1LCUP26`) does not sit under it.
  const competitionId = competitionIdForSeason(code, seasonId);
  const categoryId = categoryIdForSeason(code, seasonId);

  try {
    // Two questions, not one. Matches and groups are separate writes, so a
    // season whose matches stored and whose groups then failed must still retry
    // the groups — a single season-level skip would strand them.
    const hasMatches =
      !refetch && (await alreadyStoredTaso(categoryId, seasonId, currentTasoSeason));
    const hasGroups =
      !refetch && (await alreadyStoredTasoGroups(categoryId, seasonId, currentTasoSeason));

    if (hasMatches && hasGroups) {
      out(`  ${code} ${seasonId}: already stored, skipped`);
      return "skipped";
    }

    let matchCount = "skipped";
    if (!hasMatches) {
      const providerMatches = await taso(() => getTasoMatches(competitionId, categoryId, seasonId));
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

    out(`  ${code} ${seasonId}: ${matchCount}, ${groupCount}`);
    return "stored";
  } catch (error) {
    err(`  ${code} ${seasonId}: FAILED — ${describeError(error)}`);
    return "failed";
  }
}

/**
 * The TASO half, with its own season discovery and its own refusal to guess.
 *
 * decisions/169-production-backfill.md
 * decisions/292-sonar-zero-open-issues.md
 */
async function backfillTaso(
  taso: <T>(work: () => Promise<T>) => Promise<T>,
  refetch: boolean
): Promise<HalfResult> {
  let failures = 0;
  let skipped = 0;

  out(`\n=== TASO: ${DOMESTIC_COMPETITIONS.length} competitions ===`);

  // The current season comes from the provider, not the clock: one request
  // for the whole loop, floored per competition below as the app floors it.

  // Two failure shapes, not one: `getCurrentSeason` returns `null` when TASO
  // publishes no seasons, and throws on a network or HTTP error.
  let discovered: number | null;
  try {
    discovered = await taso(() => getCurrentSeason());
  } catch (error) {
    err(`  TASO season discovery failed — ${describeError(error)}`);
    discovered = null;
  }

  if (discovered === null) {
    failures += 1;
    err(
      "  Refusing to guess the current season — backfilling the wrong range is " +
        "worse than not backfilling. Re-run when TASO answers."
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
      // `competitionIdForSeason`, not the bare season umbrella, as above.
      const outcome = await backfillTasoSeason(
        taso,
        competition.code,
        seasonId,
        currentTasoSeason,
        refetch
      );
      if (outcome === "skipped") skipped += 1;
      if (outcome === "failed") failures += 1;
    }
  }

  return { failures, skipped };
}

export async function backfill({
  reset,
  refetch = false,
}: {
  reset: boolean;
  /** Fetch competition-seasons that are already stored, instead of skipping them. */
  refetch?: boolean;
}): Promise<number> {
  out(`Rates        football-data ${FOOTBALL_DATA_PER_MINUTE}/min, TASO ${TASO_PER_MINUTE}/min`);
  if (refetch) out("Refetch      on — already-stored competition-seasons are fetched again");

  let failures = 0;
  let skipped = 0;
  const startedAt = Date.now();

  try {
    // One round trip before any provider is called, so an unreachable database
    // does not cost a full run.
    try {
      await db.execute(sql`SELECT 1`);
    } catch (error) {
      err(`Cannot reach the database: ${describeError(error)}`);
      return 1;
    }

    if (reset) {
      out("\nResetting — deleting every row in matches, taso_matches, taso_group_teams");
      // One transaction, so a reset is all or nothing.
      await db.transaction(async (tx) => {
        await tx.delete(matches);
        await tx.delete(tasoMatches);
        await tx.delete(tasoGroupTeams);
      });
      out("Reset done.");
    }

    const footballData = createPacer(FOOTBALL_DATA_PER_MINUTE);
    const taso = createPacer(TASO_PER_MINUTE);

    const foreign = await backfillFootballData(footballData, refetch);
    failures += foreign.failures;
    skipped += foreign.skipped;

    const domestic = await backfillTaso(taso, refetch);
    failures += domestic.failures;
    skipped += domestic.skipped;
  } finally {
    // Settled together, not awaited in sequence: cleanup cannot be allowed to
    // decide whether the backfill succeeded.
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
