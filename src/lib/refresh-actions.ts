"use server";

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

  return await applyRefresh(choice, seasonId, snapshotHash, adminId);
}
