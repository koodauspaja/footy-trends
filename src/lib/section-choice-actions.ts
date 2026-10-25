"use server";

import { currentUserId } from "@/lib/current-user";
import { logger } from "@/lib/logger";
import { writeSectionChoice } from "@/lib/section-choices";
import { isKnownSection } from "@/lib/section-keys";

/**
 * The answer to a save that cannot be made, logged with its keys only and cut
 * short, since both came from the request.
 *
 * decisions/071-section-toggles.md
 */
function refused(pageKind: unknown, section: unknown): { ok: false } {
  logger.warn(
    { pageKind: String(pageKind).slice(0, 40), section: String(section).slice(0, 40) },
    "Section choice refused"
  );
  return { ok: false };
}

/**
 * Saves the signed-in reader's choice to keep a section open or closed. A kind
 * of page or section the app does not have, or a request with no session, is
 * refused and stores nothing.
 *
 * decisions/071-section-toggles.md
 */
export async function saveSectionChoiceAction(
  pageKind: string,
  section: string,
  open: boolean
): Promise<{ ok: boolean }> {
  try {
    if (!isKnownSection(pageKind, section) || typeof open !== "boolean") {
      return refused(pageKind, section);
    }
    const userId = await currentUserId();
    if (userId === null) return refused(pageKind, section);
    await writeSectionChoice(userId, pageKind, section, open);
    return { ok: true };
  } catch (error) {
    logger.error({ err: error }, "Saving a section choice failed");
    return { ok: false };
  }
}
