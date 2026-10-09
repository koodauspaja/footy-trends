import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { refreshRuns, user } from "@/db/schema";
import { logger } from "@/lib/logger";
import { competitionNameFor } from "@/lib/refresh-competitions";
import {
  type CompetitionChoice,
  isRefreshSource,
  type RefreshFailureReason,
  type RefreshPreview,
  type RefreshRunView,
  RUN_LIST_LIMIT,
} from "@/lib/refresh-view";

/**
 * The audit trail behind the forced refresh. The counts written are the diff
 * the confirmation dialog showed, never recomputed.
 *
 * decisions/029-forced-season-refresh.md
 */

/**
 * Records an applied run. Never throws: a failure here is logged and
 * swallowed.
 *
 * decisions/029-forced-season-refresh.md
 */
export async function recordSuccess(preview: RefreshPreview, adminId: string): Promise<void> {
  try {
    await db.insert(refreshRuns).values({
      source: preview.source,
      competitionCode: preview.competitionCode,
      seasonId: preview.seasonId,
      seasonLabel: preview.seasonLabel,
      status: "success",
      matchesInserted: preview.matches.inserted,
      matchesUpdated: preview.matches.updated,
      matchesDeleted: preview.matches.deleted,
      groupRowsInserted: preview.groupRows?.inserted ?? null,
      groupRowsUpdated: preview.groupRows?.updated ?? null,
      groupRowsDeleted: preview.groupRows?.deleted ?? null,
      deductionsChanged: preview.deductionChanges.length,
      runBy: adminId,
    });
  } catch (error) {
    logger.error({ err: error, adminId }, "Recording a successful refresh run failed");
  }
}

/**
 * Records a run that got far enough to try and did not finish. `"input"` and
 * `"stale"` never reach here.
 *
 * decisions/029-forced-season-refresh.md
 */
export async function recordFailure(
  choice: CompetitionChoice,
  seasonId: number,
  reason: Exclude<RefreshFailureReason, "input" | "stale">,
  adminId: string,
  /** Null when the run failed before the season range could be resolved. */
  seasonLabel: string | null = null
): Promise<void> {
  try {
    await db.insert(refreshRuns).values({
      source: choice.source,
      competitionCode: choice.code,
      seasonId,
      seasonLabel,
      status: "failed",
      reason,
      groupRowsInserted: null,
      groupRowsUpdated: null,
      groupRowsDeleted: null,
      runBy: adminId,
    });
  } catch (error) {
    logger.error({ err: error, adminId }, "Recording a failed refresh run failed");
  }
}

/**
 * A run's group counts, or null where the provider has no group standings:
 * the page renders that as `—`, not as three zeroes.
 *
 * decisions/029-forced-season-refresh.md
 */
function groupCountsFrom(row: typeof refreshRuns.$inferSelect) {
  if (
    row.groupRowsInserted === null ||
    row.groupRowsUpdated === null ||
    row.groupRowsDeleted === null
  ) {
    return null;
  }
  return {
    inserted: row.groupRowsInserted,
    updated: row.groupRowsUpdated,
    deleted: row.groupRowsDeleted,
  };
}

function reasonFrom(value: string | null): RefreshFailureReason | null {
  const reasons: RefreshFailureReason[] = [
    "input",
    "cache",
    "provider",
    "empty",
    "read",
    "stale",
    "write",
  ];
  return reasons.find((reason) => reason === value) ?? null;
}

/**
 * The recent runs, newest first, without paging. A left join for the
 * operator's name, so a run whose admin was deleted still appears.
 *
 * decisions/029-forced-season-refresh.md
 */
export async function listRuns(): Promise<RefreshRunView[]> {
  const rows = await db
    .select({ run: refreshRuns, runByName: user.name })
    .from(refreshRuns)
    .leftJoin(user, eq(refreshRuns.runBy, user.id))
    .orderBy(desc(refreshRuns.createdAt), desc(refreshRuns.id))
    .limit(RUN_LIST_LIMIT);

  return rows.flatMap(({ run, runByName }) => {
    // Only this module writes the column, from a typed union. An unrecognised
    // value is skipped, not coerced.
    if (!isRefreshSource(run.source)) {
      logger.warn({ id: run.id, source: run.source }, "Refresh run has an unknown source");
      return [];
    }

    return [
      {
        id: run.id,
        source: run.source,
        competitionName: competitionNameFor({ source: run.source, code: run.competitionCode }),
        // The label stored with the run; the season id where it failed before the
        // range was resolved.
        seasonLabel: run.seasonLabel ?? String(run.seasonId),
        succeeded: run.status === "success",
        reason: reasonFrom(run.reason),
        matches: {
          inserted: run.matchesInserted,
          updated: run.matchesUpdated,
          deleted: run.matchesDeleted,
        },
        groupRows: groupCountsFrom(run),
        deductionsChanged: run.deductionsChanged,
        runByName,
        createdAt: run.createdAt.toISOString(),
      },
    ];
  });
}
