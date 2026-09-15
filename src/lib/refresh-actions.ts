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
 * The `"use server"` boundary for the forced season refresh, from
 * specs/029-forced-season-refresh.md.
 *
 * **`requireAdmin()` runs first in every one of these, before the arguments are
 * looked at.** A server action is a public network endpoint whether or not
 * anything renders a control for it, so neither the missing link nor the page's
 * not-found response keeps a caller out — only the gate does. The same rule
 * `admin-actions.ts` and `favourite-actions.ts` follow.
 *
 * None of these takes an acting-user id: it comes from the gate, never from the
 * caller.
 *
 * The competition arrives as the `<select>`'s own encoded value, which is a
 * string from the browser like any other. `decodeChoice` checks its shape and
 * `isKnownCompetition` checks it against the registries; a value failing either
 * is refused here rather than carried into the engine.
 */

/**
 * Both spellings of the page, so the run list refreshes whichever URL is open —
 * the same pair `admin-actions.ts` revalidates for the user table.
 */
const REFRESH_PATHS = ["/yllapito/data", "/admin/data"] as const;

/** Refusals that never reached the engine, so they carry no other detail. */
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
 * The only action that writes.
 *
 * `snapshotHash` is the fingerprint of the diff the admin approved. It is not
 * trusted as data — the engine recomputes the diff and compares — it only
 * answers "is this still the thing you were shown".
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

  /**
   * Only on success, and only here.
   *
   * The run list is server-rendered, so without this the row just written stays
   * invisible until the admin reloads — an audit log that does not show the
   * thing that was audited. A refusal wrote no row, so revalidating for one
   * would re-render the page to prove nothing changed.
   */
  if (result.ok) {
    for (const path of REFRESH_PATHS) revalidatePath(path);
  }

  return result;
}
