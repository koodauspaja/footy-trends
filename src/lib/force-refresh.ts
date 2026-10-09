import { and, eq, inArray } from "drizzle-orm";
import { db, type Executor } from "@/db";
import { matches, tasoGroupTeams, tasoMatches } from "@/db/schema";
import { invalidateCache } from "@/lib/cache";
import {
  categoryIdForSeason,
  competitionIdForSeason,
  earliestSeasonFor,
} from "@/lib/domestic-competitions";
import { listSelectableTasoSeasons } from "@/lib/domestic-page-context";
import {
  footballDataMatchesCacheKey,
  getSeasonMatches as getForeignSeasonMatches,
  getSeasonContext,
  type NormalizedProviderMatch,
} from "@/lib/football-data";
import { logger } from "@/lib/logger";
import { competitionNameFor, isKnownCompetition } from "@/lib/refresh-competitions";
import {
  type DiffableGroupTeam,
  type DiffableProviderMatch,
  type DiffableStoredMatch,
  diffGroupTeams,
  diffMatches,
  snapshotHash,
} from "@/lib/refresh-diff";
import { recordFailure, recordSuccess } from "@/lib/refresh-runs";
import type {
  ApplyResult,
  CompetitionChoice,
  PreviewResult,
  RefreshPreview,
  SeasonChoice,
  SeasonsResult,
} from "@/lib/refresh-view";
import {
  standingsCacheKey,
  storedForeignSeasons,
  synchronizeMatches as synchronizeForeignMatches,
} from "@/lib/standings-service";
import {
  getSeasonGroups,
  getSeasonMatches as getTasoSeasonMatches,
  type NormalizedTasoGroupTeam,
  type NormalizedTasoMatch,
  normalizeGroupTeams,
  tasoCategoryCacheKey,
  tasoMatchesCacheKey,
} from "@/lib/taso";
import {
  dedupeByIdentity,
  resolveTasoSeasonCeiling,
  storedTasoSeasons,
  synchronizeGroupTeams,
  synchronizeMatches as synchronizeTasoMatches,
} from "@/lib/taso-standings-service";

/**
 * Forced refresh of one competition-season. `previewRefresh` writes nothing and
 * `applyRefresh` only the diff an admin approved: a provider that goes silent
 * never costs data, and one that answers corrects it only with consent.
 *
 * decisions/029-forced-season-refresh.md
 */

/**
 * The seasons of this competition we hold rows for, from the helpers the
 * reader-facing pickers use. Loaded per competition, never all at once.
 *
 * decisions/029-forced-season-refresh.md
 */
export async function listSeasonsFor(choice: CompetitionChoice): Promise<SeasonsResult> {
  if (!isKnownCompetition(choice)) return { ok: false, reason: "input" };

  // Apart from the provider calls, so a database failure reports `"read"`. Held
  // seasons only: importing a season is the ordinary sync's job.
  let stored: Set<number>;
  try {
    stored = await storedSeasonsFor(choice);
  } catch (error) {
    logger.error({ err: error, ...choice }, "Reading which seasons are stored failed");
    return { ok: false, reason: "read" };
  }
  const held = (seasons: SeasonChoice[]) => seasons.filter((season) => stored.has(season.seasonId));

  try {
    if (choice.source === "taso") {
      // Never `resolveTasoSeasonContext`: it probes by synchronizing, which writes.
      const { currentSeason } = await resolveTasoSeasonCeiling(choice.code);
      return {
        ok: true,
        seasons: held(listSelectableTasoSeasons(currentSeason, earliestSeasonFor(choice.code))),
      };
    }
    const { selectableSeasons } = await getSeasonContext(choice.code);
    return { ok: true, seasons: held(selectableSeasons) };
  } catch (error) {
    logger.warn({ err: error, ...choice }, "Listing seasons for a forced refresh failed");
    return { ok: false, reason: "provider" };
  }
}

/**
 * Every season we hold rows for in one competition, asked of the service owning the tables.
 *
 * decisions/029-forced-season-refresh.md
 */
async function storedSeasonsFor(choice: CompetitionChoice): Promise<Set<number>> {
  return choice.source === "taso"
    ? await storedTasoSeasons(choice.code)
    : await storedForeignSeasons(choice.code);
}

function seasonLabelFor(seasons: SeasonChoice[], seasonId: number): string | null {
  return seasons.find((season) => season.seasonId === seasonId)?.label ?? null;
}

/**
 * What one provider answered for one season, with the ids its rows are stored
 * under. A union, because only TASO has group standings.
 *
 * decisions/029-forced-season-refresh.md
 */
type Snapshot =
  | {
      source: "taso";
      competitionId: string;
      categoryId: string;
      matches: NormalizedTasoMatch[];
      groupTeams: NormalizedTasoGroupTeam[];
    }
  | {
      source: "football-data";
      /** Carried so the write can re-read the stored rows without the choice. */
      competitionCode: string;
      matches: NormalizedProviderMatch[];
    };

/**
 * The Redis entries a refetch must clear: the answer refetched and anything
 * computed from it, each key from its owner's builder. Season and name lists stay.
 *
 * decisions/029-forced-season-refresh.md
 */
export function cacheKeysFor(choice: CompetitionChoice, seasonId: number): string[] {
  if (choice.source === "taso") {
    const competitionId = competitionIdForSeason(choice.code, seasonId);
    const categoryId = categoryIdForSeason(choice.code, seasonId);
    return [
      tasoMatchesCacheKey(competitionId, categoryId),
      tasoCategoryCacheKey(competitionId, categoryId),
    ];
  }
  return [
    footballDataMatchesCacheKey(choice.code, seasonId),
    // The computed table, or the old standings show for fifteen minutes.
    standingsCacheKey(choice.code, seasonId),
  ];
}

async function clearCaches(keys: string[]): Promise<boolean> {
  const cleared = await Promise.all(keys.map((key) => invalidateCache(key)));
  return cleared.every(Boolean);
}

async function fetchSnapshot(choice: CompetitionChoice, seasonId: number): Promise<Snapshot> {
  if (choice.source === "taso") {
    // Derived as `domestic-page-context.ts` does, so the rows compared are the
    // rows the page reads.
    const competitionId = competitionIdForSeason(choice.code, seasonId);
    const categoryId = categoryIdForSeason(choice.code, seasonId);
    const [providerMatches, groups] = await Promise.all([
      getTasoSeasonMatches(competitionId, categoryId, seasonId),
      getSeasonGroups(competitionId, categoryId),
    ]);
    return {
      source: "taso",
      competitionId,
      categoryId,
      matches: providerMatches,
      groupTeams: normalizeGroupTeams(groups, categoryId, competitionId, seasonId),
    };
  }
  return {
    source: "football-data",
    competitionCode: choice.code,
    matches: await getForeignSeasonMatches(choice.code, seasonId),
  };
}

/**
 * The group rows as the writer will actually store them.
 *
 * decisions/029-forced-season-refresh.md
 */
function dedupedGroupTeams(snapshot: Extract<Snapshot, { source: "taso" }>) {
  return dedupeByIdentity(snapshot.groupTeams);
}

/**
 * The TASO rows we hold, through the database or the write's transaction.
 *
 * decisions/029-forced-season-refresh.md
 */
async function readStoredTaso(
  executor: Executor,
  snapshot: Extract<Snapshot, { source: "taso" }>,
  seasonId: number
) {
  return await Promise.all([
    executor
      .select()
      .from(tasoMatches)
      .where(
        and(
          eq(tasoMatches.categoryId, snapshot.categoryId),
          eq(tasoMatches.competitionCode, snapshot.competitionId),
          eq(tasoMatches.seasonId, seasonId)
        )
      ),
    executor
      .select()
      .from(tasoGroupTeams)
      .where(
        and(
          eq(tasoGroupTeams.categoryId, snapshot.categoryId),
          eq(tasoGroupTeams.competitionCode, snapshot.competitionId),
          eq(tasoGroupTeams.seasonId, seasonId)
        )
      ),
  ]);
}

async function readStoredForeign(executor: Executor, competitionCode: string, seasonId: number) {
  return await executor
    .select()
    .from(matches)
    .where(and(eq(matches.competitionCode, competitionCode), eq(matches.seasonId, seasonId)));
}

/**
 * What we hold for this season, through whichever executor is given. No
 * `groupTeams` for football-data: no table is not the same as an empty one.
 *
 * decisions/029-forced-season-refresh.md
 */
async function readStored(
  executor: Executor,
  snapshot: Snapshot,
  seasonId: number
): Promise<StoredRows> {
  if (snapshot.source !== "taso") {
    return { matches: await readStoredForeign(executor, snapshot.competitionCode, seasonId) };
  }
  const [matches, groupTeams] = await readStoredTaso(executor, snapshot, seasonId);
  return { matches, groupTeams };
}

type StoredRows = {
  matches: DiffableStoredMatch[];
  /** Absent for football-data, which has no group standings table. */
  groupTeams?: DiffableGroupTeam[];
};

/**
 * The whole comparison, pure: is the provider silent, what would change, and
 * the pairing's fingerprint. The preview and the write's transaction both run it.
 *
 * decisions/029-forced-season-refresh.md
 */
function compare(
  snapshot: Snapshot,
  stored: StoredRows,
  resolved: Resolved
): { ok: true; computed: Computed } | { ok: false; reason: "empty"; storedRows: number } {
  const storedGroupTeams = stored.groupTeams ?? [];
  const providerGroupTeams = snapshot.source === "taso" ? dedupedGroupTeams(snapshot) : [];

  // Per table: matches without standings is still silence, and
  // `synchronizeGroupTeams` deletes before it inserts.
  const matchesSilent = snapshot.matches.length === 0 && stored.matches.length > 0;
  const groupsSilent =
    stored.groupTeams !== undefined &&
    providerGroupTeams.length === 0 &&
    storedGroupTeams.length > 0;
  if (matchesSilent || groupsSilent) {
    return {
      ok: false,
      reason: "empty",
      storedRows: stored.matches.length + storedGroupTeams.length,
    };
  }

  // Spelled out: inference would pick one provider's row type from the union.
  const matchDiff = diffMatches<DiffableStoredMatch, DiffableProviderMatch>(
    stored.matches,
    snapshot.matches
  );
  // Deduplicated with the writer's rule before the diff and the hash: a knockout
  // group repeats an advancing team, and the writer keeps only the first.
  const groupDiff =
    stored.groupTeams === undefined ? null : diffGroupTeams(storedGroupTeams, providerGroupTeams);

  return {
    ok: true,
    computed: {
      snapshot,
      removedIds: matchDiff.removed.map((match) => match.providerMatchId),
      preview: {
        ...previewShell(resolved),
        matches: matchDiff.counts,
        // Null rather than zeroes for football-data: "none exist" is a
        // different statement from "none changed".
        groupRows: groupDiff?.counts ?? null,
        deductionChanges: groupDiff?.deductionChanges ?? [],
        removedMatches: matchDiff.removed,
        snapshotHash: snapshotHashOf(snapshot, stored.matches, storedGroupTeams),
      },
    },
  };
}

/**
 * The fingerprint an approval is made of: the provider's answer and the rows
 * it was compared against, so neither can move under an approval.
 *
 * decisions/029-forced-season-refresh.md
 */
function snapshotHashOf(
  snapshot: Snapshot,
  storedMatches: readonly object[],
  storedGroupTeams: readonly object[]
): string {
  return snapshot.source === "taso"
    ? snapshotHash([snapshot.matches, dedupedGroupTeams(snapshot), storedMatches, storedGroupTeams])
    : snapshotHash([snapshot.matches, storedMatches]);
}

function previewShell(resolved: Resolved) {
  return {
    source: resolved.choice.source,
    competitionCode: resolved.choice.code,
    competitionName: resolved.competitionName,
    seasonId: resolved.seasonId,
    seasonLabel: resolved.seasonLabel,
  };
}

type Resolved = {
  choice: CompetitionChoice;
  seasonId: number;
  seasonLabel: string;
  competitionName: string;
};

/**
 * Validates the competition and season against the registries and the freshly
 * resolved range. The apply re-runs it, as a server action's arguments are public.
 *
 * decisions/029-forced-season-refresh.md
 */
async function resolve(
  choice: CompetitionChoice,
  seasonId: number
): Promise<Resolved | { reason: "input" | "provider" | "read" }> {
  if (!isKnownCompetition(choice)) return { reason: "input" };
  if (!Number.isInteger(seasonId)) return { reason: "input" };

  // Carried, not flattened: `"read"` and `"provider"` send an operator to
  // different systems. `"input"` is ruled out above.
  const seasons = await listSeasonsFor(choice);
  if (!seasons.ok) return { reason: seasons.reason === "read" ? "read" : "provider" };

  const seasonLabel = seasonLabelFor(seasons.seasons, seasonId);
  if (seasonLabel === null) return { reason: "input" };

  return { choice, seasonId, seasonLabel, competitionName: competitionNameFor(choice) };
}

function isResolved(value: Resolved | { reason: string }): value is Resolved {
  return "seasonLabel" in value;
}

type Computed = { preview: RefreshPreview; snapshot: Snapshot; removedIds: number[] };

type DiffOutcome =
  | { ok: true; computed: Computed }
  | {
      ok: false;
      reason: "cache" | "provider" | "empty" | "read";
      storedRows?: number | undefined;
    };

/**
 * Clears the caches, fetches and diffs: the half both entry points share. The
 * `"empty"` refusal is here, not in the writer the ordinary sync also uses.
 *
 * decisions/029-forced-season-refresh.md
 */
async function computeDiff(resolved: Resolved, bypassCache: boolean): Promise<DiffOutcome> {
  const { choice, seasonId } = resolved;

  // The preview clears, and a failed clear stops it. The apply reads back what
  // the preview warmed, so what was seen is what is applied.
  if (bypassCache && !(await clearCaches(cacheKeysFor(choice, seasonId)))) {
    return { ok: false, reason: "cache" };
  }

  let snapshot: Snapshot;
  try {
    snapshot = await fetchSnapshot(choice, seasonId);
  } catch (error) {
    logger.warn({ err: error, ...choice, seasonId }, "Forced refresh could not reach the provider");
    return { ok: false, reason: "provider" };
  }

  // A failed read is `"read"`: neither a 500 nor the provider's fault.
  let outcome: ReturnType<typeof compare>;
  try {
    outcome = compare(snapshot, await readStored(db, snapshot, seasonId), resolved);
  } catch (error) {
    logger.error(
      { err: error, ...choice, seasonId },
      "Forced refresh could not read what is currently stored"
    );
    return { ok: false, reason: "read" };
  }

  if (!outcome.ok) {
    logger.warn(
      { ...choice, seasonId, storedRows: outcome.storedRows },
      "Forced refresh refused: the provider answered with nothing for a season we hold"
    );
  }
  return outcome;
}

export async function previewRefresh(
  choice: CompetitionChoice,
  seasonId: number
): Promise<PreviewResult> {
  const resolved = await resolve(choice, seasonId);
  if (!isResolved(resolved)) return { ok: false, reason: resolved.reason };

  const diff = await computeDiff(resolved, true);
  if (!diff.ok) return { ok: false, reason: diff.reason, storedRows: diff.storedRows };

  return { ok: true, preview: diff.computed.preview };
}

/**
 * Writes the diff, and only the diff the admin was shown: a hash that moved
 * since the preview refuses and hands back the new preview.
 *
 * decisions/029-forced-season-refresh.md
 */
export async function applyRefresh(
  choice: CompetitionChoice,
  seasonId: number,
  expectedHash: string,
  adminId: string
): Promise<ApplyResult> {
  const resolved = await resolve(choice, seasonId);
  if (!isResolved(resolved)) {
    // A failed run is recorded; `"input"` is a malformed request, not an event.
    if (resolved.reason !== "input") {
      await recordFailure(choice, seasonId, resolved.reason, adminId);
    }
    return { ok: false, reason: resolved.reason };
  }

  const diff = await computeDiff(resolved, false);
  if (!diff.ok) {
    await recordFailure(choice, seasonId, diff.reason, adminId, resolved.seasonLabel);
    return { ok: false, reason: diff.reason };
  }

  const { preview, snapshot, removedIds } = diff.computed;
  if (preview.snapshotHash !== expectedHash) {
    return { ok: false, reason: "stale", preview };
  }

  try {
    // Re-checked inside the transaction, which on a mismatch hands back the
    // diff of the rows stored now.
    const written = await writeSnapshot(snapshot, seasonId, removedIds, expectedHash, resolved);
    if (!written.ok) return { ok: false, reason: "stale", preview: written.preview };
  } catch (error) {
    logger.error({ err: error, ...choice, seasonId, adminId }, "Forced refresh failed to write");
    await recordFailure(choice, seasonId, "write", adminId, resolved.seasonLabel);
    return { ok: false, reason: "write" };
  }

  await recordSuccess(preview, adminId);
  return { ok: true, applied: preview };
}

/**
 * One transaction per run, so a half-applied season cannot happen. Withdrawn
 * matches go by the ids the preview listed, as `synchronizeMatches` never deletes.
 *
 * decisions/029-forced-season-refresh.md
 */
async function writeSnapshot(
  snapshot: Snapshot,
  seasonId: number,
  removedIds: number[],
  expectedHash: string,
  resolved: Resolved
): Promise<{ ok: true } | { ok: false; preview: RefreshPreview | undefined }> {
  return await db.transaction(
    async (tx) => {
      // The same `compare`, through `tx`: an approval that no longer describes
      // the stored rows writes nothing. `undefined` when the provider went silent.
      const current = compare(snapshot, await readStored(tx, snapshot, seasonId), resolved);
      if (!current.ok) return { ok: false, preview: undefined };
      if (current.computed.preview.snapshotHash !== expectedHash) {
        return { ok: false, preview: current.computed.preview };
      }

      if (snapshot.source === "taso") {
        // `tx`, not `db`, or each writer commits on its own connection.
        await synchronizeTasoMatches(snapshot.matches, tx);
        await synchronizeGroupTeams(
          snapshot.categoryId,
          snapshot.competitionId,
          seasonId,
          snapshot.groupTeams,
          tx
        );
        if (removedIds.length > 0) {
          await tx.delete(tasoMatches).where(inArray(tasoMatches.providerMatchId, removedIds));
        }
        return { ok: true };
      }

      await synchronizeForeignMatches(snapshot.matches, tx);
      if (removedIds.length > 0) {
        await tx.delete(matches).where(inArray(matches.providerMatchId, removedIds));
      }
      return { ok: true };
    },
    {
      /** Read-committed would miss a commit between the re-read and the write. */
      isolationLevel: "serializable",
    }
  );
}
