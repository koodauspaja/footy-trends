import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sectionChoice } from "@/db/schema";
import { currentUserId } from "@/lib/current-user";
import { logger } from "@/lib/logger";
import {
  defaultSections,
  type PageKind,
  type PageSectionsOf,
  type SectionChoices,
} from "@/lib/section-keys";

/**
 * One reader's stored choices on one kind of page, by section.
 *
 * decisions/071-section-toggles.md
 */
export async function readSectionChoices(userId: string, kind: PageKind): Promise<SectionChoices> {
  const rows = await db
    .select({ section: sectionChoice.section, open: sectionChoice.open })
    .from(sectionChoice)
    .where(and(eq(sectionChoice.userId, userId), eq(sectionChoice.pageKind, kind)));
  return Object.fromEntries(rows.map((row) => [row.section, row.open]));
}

/**
 * Stores one choice, replacing the reader's earlier one for the same section,
 * so the last toggle wins.
 *
 * decisions/071-section-toggles.md
 */
export async function writeSectionChoice(
  userId: string,
  kind: PageKind,
  section: string,
  open: boolean
): Promise<void> {
  const updatedAt = new Date();
  await db
    .insert(sectionChoice)
    .values({ userId, pageKind: kind, section, open, updatedAt })
    .onConflictDoUpdate({
      target: [sectionChoice.userId, sectionChoice.pageKind, sectionChoice.section],
      set: { open, updatedAt },
    });
}

/**
 * A page's sections for whoever is reading it, read once on the server. A
 * failed read gives the defaults, as a signed-out reader gets.
 *
 * decisions/071-section-toggles.md
 */
export async function getPageSections<K extends PageKind>(kind: K): Promise<PageSectionsOf<K>> {
  let userId: string | null = null;
  try {
    userId = await currentUserId();
    if (userId === null) return defaultSections(kind);
    return { kind, signedIn: true, choices: await readSectionChoices(userId, kind) };
  } catch (error) {
    logger.error({ err: error }, "Reading section choices failed");
    return { ...defaultSections(kind), signedIn: userId !== null };
  }
}
