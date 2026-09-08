"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isFavouriteSource, isTeamProviderId } from "@/lib/favourite-keys";
import {
  removeFavouriteCompetition,
  removeFavouriteTeam,
  toggleFavouriteCompetition,
  toggleFavouriteTeam,
} from "@/lib/favourites";
import { logger } from "@/lib/logger";
import { isRegionSegment } from "@/lib/regions";

/**
 * Writing favourites, from specs/026-favourites.md.
 *
 * `ok: false` carries a reason because the reader's next move differs: at the
 * cap they must remove something, and on a failure they should try again.
 */
export type ToggleResult =
  | { ok: true; favorite: boolean }
  | { ok: false; reason: "limit" | "failed" };

export type ActionResult = { ok: true } | { ok: false };

/**
 * Both spellings of the favourites page.
 *
 * The route is defined at `/favorites` and read at `/suosikit` — CLAUDE.md's
 * split, joined by the rewrite in `next.config.ts`. #292 established that the
 * reader's URL is the one that matters; the folder path is revalidated beside it
 * because the extra call costs nothing and this cannot be exercised end to end —
 * the action needs a real session, which the e2e suite cannot forge.
 */
const FAVOURITES_PATHS = ["/suosikit", "/favorites"] as const;

function revalidateFavourites(): void {
  for (const path of FAVOURITES_PATHS) revalidatePath(path);
}

/**
 * The signed-in user's id, or null.
 *
 * The rule every write in this app follows: **no action accepts a user id from
 * the client**, which removes "favourite something for someone else" as a
 * category rather than checking for it. See `settings-actions.ts`.
 */
async function currentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function toggleFavouriteTeamAction(
  source: string,
  teamProviderId: number
): Promise<ToggleResult> {
  try {
    const userId = await currentUserId();
    if (userId === null) return { ok: false, reason: "failed" };

    // Validated here, not trusted from the caller: these cross a network
    // boundary as plain arguments, and a source the app does not have would
    // become a row nothing can ever match or remove.
    if (!isFavouriteSource(source)) return { ok: false, reason: "failed" };
    if (!isTeamProviderId(teamProviderId)) return { ok: false, reason: "failed" };

    const written = await toggleFavouriteTeam(userId, source, teamProviderId);
    if (!written.ok) return written;

    revalidateFavourites();
    return written;
  } catch (error) {
    logger.error({ err: error }, "Toggling a favourite team failed");
    return { ok: false, reason: "failed" };
  }
}

export async function toggleFavouriteCompetitionAction(
  region: string,
  code: string
): Promise<ToggleResult> {
  try {
    const userId = await currentUserId();
    if (userId === null) return { ok: false, reason: "failed" };
    if (!isRegionSegment(region) || code.trim() === "") return { ok: false, reason: "failed" };

    const written = await toggleFavouriteCompetition(userId, region, code);
    if (!written.ok) return written;

    revalidateFavourites();
    return written;
  } catch (error) {
    logger.error({ err: error }, "Toggling a favourite competition failed");
    return { ok: false, reason: "failed" };
  }
}

export async function removeFavouriteTeamAction(
  source: string,
  teamProviderId: number
): Promise<ActionResult> {
  try {
    const userId = await currentUserId();
    if (userId === null) return { ok: false };
    // The same two checks the toggle makes: this id crosses the same boundary,
    // and an asymmetry between the two would only invite one of them to drift.
    if (!isFavouriteSource(source)) return { ok: false };
    if (!isTeamProviderId(teamProviderId)) return { ok: false };

    await removeFavouriteTeam(userId, source, teamProviderId);
    revalidateFavourites();
    return { ok: true };
  } catch (error) {
    logger.error({ err: error }, "Removing a favourite team failed");
    return { ok: false };
  }
}

export async function removeFavouriteCompetitionAction(
  region: string,
  code: string
): Promise<ActionResult> {
  try {
    const userId = await currentUserId();
    if (userId === null) return { ok: false };
    if (!isRegionSegment(region)) return { ok: false };

    await removeFavouriteCompetition(userId, region, code);
    revalidateFavourites();
    return { ok: true };
  } catch (error) {
    logger.error({ err: error }, "Removing a favourite competition failed");
    return { ok: false };
  }
}
