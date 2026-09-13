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
 * The audit trail behind the forced refresh, from
 * specs/029-forced-season-refresh.md.
 *
 * A forced refresh happens a handful of times a year, so the questions it has
 * to answer are asked months apart by someone with no memory of the event:
 * when did we last refresh this, did it work, and what did it move?
 *
 * The counts written here come from the same diff the confirmation dialog
 * showed, never recomputed — so what an admin approved and what is recorded
 * are the same numbers by construction rather than by two pieces of code
 * agreeing.
 */

/**
 * Records an applied run.
 *
 * Never throws. A refresh that succeeded has already changed the database, and
 * losing the note of it is not a reason to tell an admin their change failed —
 * so a failure here is logged and swallowed, which is the one place in this
 * feature where swallowing is right.
 */
export async function recordSuccess(preview: RefreshPreview, adminId: string): Promise<void> {
  try {
    await db.insert(refreshRuns).values({
      source: preview.source,
      competitionCode: preview.competitionCode,
      seasonId: preview.seasonId,
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
 * Records a run that got far enough to try and did not finish.
 *
 * `"input"` and `"stale"` never reach here. A submission naming a competition
 * or season this app does not have is a malformed request rather than an event
 * that happened to the data; a stale bounce is the apply working exactly as
 * intended, and the admin is about to see the fresh diff and decide again.
 * Recording either would fill the log with noise nobody can act on.
 */
export async function recordFailure(
  choice: CompetitionChoice,
  seasonId: number,
  reason: Exclude<RefreshFailureReason, "input" | "stale">,
  adminId: string
): Promise<void> {
  try {
    await db.insert(refreshRuns).values({
      source: choice.source,
      competitionCode: choice.code,
      seasonId,
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
 * Counts are stored as three nullable columns, and a foreign competition
 * stores null in all three because it has no group standings at all. Null
 * means "this table does not exist for this provider", which the page renders
 * as `—` — a different statement from three zeroes, which would claim nothing
 * changed.
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
 * The recent runs, newest first.
 *
 * No paging. The table gains a handful of rows a year, and a list that needed
 * paging would itself be the finding. A left join for the operator's name, so a
 * run whose admin has since been deleted still appears — with `run_by` null,
 * which is what `on delete set null` on that column is for.
 */
export async function listRuns(): Promise<RefreshRunView[]> {
  const rows = await db
    .select({ run: refreshRuns, runByName: user.name })
    .from(refreshRuns)
    .leftJoin(user, eq(refreshRuns.runBy, user.id))
    .orderBy(desc(refreshRuns.createdAt), desc(refreshRuns.id))
    .limit(RUN_LIST_LIMIT);

  return rows.flatMap(({ run, runByName }) => {
    // Only this module writes the column, and only from a typed union, so an
    // unrecognised value cannot come from the app. Skipped rather than coerced:
    // guessing which provider a hand-edited row meant would put a wrong
    // competition name in an audit log.
    if (!isRefreshSource(run.source)) {
      logger.warn({ id: run.id, source: run.source }, "Refresh run has an unknown source");
      return [];
    }

    return [
      {
        id: run.id,
        source: run.source,
        competitionName: competitionNameFor({ source: run.source, code: run.competitionCode }),
        // The stored integer, not the provider's display label: a foreign
        // season renders as `2025/26` in the picker, and reproducing that here
        // would mean a provider call per row to learn whether the season spans
        // two calendar years. The start year is unambiguous, which is what an
        // audit row needs.
        seasonLabel: String(run.seasonId),
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
