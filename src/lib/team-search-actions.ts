"use server";

import { currentUserId } from "@/lib/current-user";
import { logger } from "@/lib/logger";
import { isSearchable, searchTeams, type TeamSearchView } from "@/lib/team-search";

/**
 * What a team search answers. `ok: false` carries a reason, because the
 * reader's next move differs.
 *
 * decisions/027-team-search.md
 */
export type TeamSearchResult =
  | { ok: true; teams: TeamSearchView[] }
  | { ok: false; reason: "unauthenticated" | "too-short" | "failed" };

/**
 * The search itself. The session is checked here, not only in the component;
 * `currentUserId` keeps `@/lib/auth` out of the client bundle's graph.
 *
 * decisions/027-team-search.md
 */
export async function searchTeamsAction(term: string): Promise<TeamSearchResult> {
  try {
    const userId = await currentUserId();
    if (userId === null) return { ok: false, reason: "unauthenticated" };

    // Checked before querying, so one keystroke cannot scan the match tables.
    if (!isSearchable(term)) return { ok: false, reason: "too-short" };

    return { ok: true, teams: await searchTeams(term) };
  } catch (error) {
    logger.error({ err: error }, "Searching for a team failed");
    return { ok: false, reason: "failed" };
  }
}
