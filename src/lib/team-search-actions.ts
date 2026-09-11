"use server";

import { currentUserId } from "@/lib/current-user";
import { logger } from "@/lib/logger";
import { isSearchable, searchTeams, type TeamSearchView } from "@/lib/team-search";

/**
 * Searching for a team, from specs/027-team-search.md.
 *
 * `ok: false` carries a reason because the reader's next move differs: a short
 * term needs another character, a failure needs another attempt, and a
 * signed-out caller needs nothing at all — the field is not offered to them.
 */
export type TeamSearchResult =
  | { ok: true; teams: TeamSearchView[] }
  | { ok: false; reason: "unauthenticated" | "too-short" | "failed" };

/**
 * The search itself.
 *
 * **The session is checked here, not only in the component.** Hiding the field
 * from a signed-out reader is a UX decision; this is the gate. A server action
 * is a public endpoint whether or not anything renders a control for it.
 *
 * `currentUserId` rather than importing `@/lib/auth` directly: this module is
 * imported by name from a client component, and a static import would put
 * better-auth into that bundle's graph — the failure that cost 114 CI tests in
 * #306.
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
