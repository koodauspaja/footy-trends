import type { ReactNode } from "react";
import { TABLE_HEADING } from "@/components/heading-classes";
import { SectionFold } from "@/components/section-fold";

/**
 * One of the page's sections, folded by its heading with its count after it.
 * Only `Tulevat ottelut`, `Kauden arvaukset`, `Tulostaulukko` and `Ryhmät`
 * start open; nothing is remembered.
 *
 * decisions/072-match-guesses.md
 * decisions/073-leaderboard.md
 * decisions/075-season-guesses.md
 * decisions/078-private-groups.md
 */
export function GameFold({
  id,
  heading,
  count,
  open,
  children,
}: Readonly<{ id: string; heading: string; count: string; open: boolean; children: ReactNode }>) {
  return (
    <SectionFold
      className="mt-8"
      fold={{ initiallyOpen: open, remember: null }}
      headingId={id}
      summary={
        <>
          <h2 className={TABLE_HEADING} id={id}>
            {heading}
          </h2>
          <span className="text-muted text-sm">({count})</span>
        </>
      }
      summaryClassName="mb-2"
    >
      {children}
    </SectionFold>
  );
}
