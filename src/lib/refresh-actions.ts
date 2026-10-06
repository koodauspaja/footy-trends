"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { applyRefresh, listSeasonsFor, previewRefresh } from "@/lib/force-refresh";
import { isKnownCompetition } from "@/lib/refresh-competitions";
import {
  type ApplyResult,
  decodeChoice,
  type PreviewResult,
  type SeasonsResult,
} from "@/lib/refresh-view";

/**
 * The `"use server"` boundary for the forced season refresh. `requireAdmin()`
 * runs first in every action, before the arguments are looked at, and the
 * acting user's id comes from that gate, never from the caller.
 *
 * decisions/029-forced-season-refresh.md
 */

/**
 * Both spellings of the page, so the run list refreshes whichever URL is open —
 * the same pair `admin-actions.ts` revalidates for the user table.
 *
 * decisions/029-forced-season-refresh.md
 */
const REFRESH_PATHS = ["/yllapito/data", "/admin/data"] as const;

/**
 * Refusals that never reached the engine, so they carry no other detail.
 *
 * decisions/029-forced-season-refresh.md
 */
const REFUSED_SEASONS: SeasonsResult = { ok: false, reason: "input" };
const REFUSED_PREVIEW: PreviewResult = { ok: false, reason: "input" };
const REFUSED_APPLY: ApplyResult = { ok: false, reason: "input" };

function choiceFrom(value: unknown) {
  const choice = decodeChoice(value);
  if (choice === null || !isKnownCompetition(choice)) return null;
  return choice;
}

export async function seasonsForCompetitionAction(competition: string): Promise<SeasonsResult> {
  if ((await requireAdmin()) === null) return REFUSED_SEASONS;

  const choice = choiceFrom(competition);
  if (choice === null) return REFUSED_SEASONS;

  return await listSeasonsFor(choice);
}

export async function previewRefreshAction(
  competition: string,
  seasonId: number
): Promise<PreviewResult> {
  if ((await requireAdmin()) === null) return REFUSED_PREVIEW;

  const choice = choiceFrom(competition);
  if (choice === null) return REFUSED_PREVIEW;

  return await previewRefresh(choice, seasonId);
}

/**
 * The only action that writes. `snapshotHash` is the fingerprint of the diff
 * the admin approved, and is not trusted as data: the engine recomputes it.
 *
 * decisions/029-forced-season-refresh.md
 */
export async function applyRefreshAction(
  competition: string,
  seasonId: number,
  snapshotHash: string
): Promise<ApplyResult> {
  const adminId = await requireAdmin();
  if (adminId === null) return REFUSED_APPLY;

  const choice = choiceFrom(competition);
  if (choice === null) return REFUSED_APPLY;

  const result = await applyRefresh(choice, seasonId, snapshotHash, adminId);

  // Only on success, and only here: the run list is server-rendered, and a
  // refusal wrote no row.
  if (result.ok) {
    for (const path of REFRESH_PATHS) revalidatePath(path);
  }

  return result;
}
