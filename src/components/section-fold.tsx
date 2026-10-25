"use client";

import { createContext, type ReactNode, type SyntheticEvent, useContext, useState } from "react";
import { FoldMarker } from "@/components/fold-marker";
import { reportClientError } from "@/lib/report-client-error";
import { saveSectionChoiceAction } from "@/lib/section-choice-actions";
import type { FoldState } from "@/lib/section-keys";

/**
 * What the page shows, such as its competition, season and round. A fold under
 * it starts over from its render when it changes, as on a load.
 *
 * decisions/071-section-toggles.md
 */
const FoldPage = createContext("");

/**
 * Tells every fold under it which page it is on, so another season or round
 * starts each over without remounting the page.
 *
 * decisions/071-section-toggles.md
 */
export function FoldsFor({ page, children }: Readonly<{ page: string; children: ReactNode }>) {
  return <FoldPage value={page}>{children}</FoldPage>;
}

/**
 * A section a reader can fold away and back: a region named by its heading, in
 * a `<details>` whose summary holds it. A toggle is saved when the fold names
 * what to remember; a failed save leaves the fold as the reader set it.
 *
 * decisions/416-team-page-folds.md
 * decisions/419-shared-fold-marker.md
 * decisions/071-section-toggles.md
 */
export function SectionFold({
  headingId,
  summary,
  fold,
  className,
  summaryClassName = "",
  children,
}: Readonly<{
  headingId: string;
  /** The heading, and anything after it such as a count. */
  summary: ReactNode;
  fold: FoldState;
  className?: string;
  summaryClassName?: string;
  children: ReactNode;
}>) {
  const { remember } = fold;
  const page = useContext(FoldPage);
  const [open, setOpen] = useState(fold.initiallyOpen);
  const [drawnFor, setDrawnFor] = useState(page);
  // Another season or round: the fold starts over from its new render.
  if (page !== drawnFor) {
    setDrawnFor(page);
    setOpen(fold.initiallyOpen);
  }

  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const next = event.currentTarget.open;
    // A nested fold's toggle reaches this handler too, and the browser also
    // announces the state the fold was rendered in.
    if (event.target !== event.currentTarget || next === open) return;
    setOpen(next);
    if (remember === null) return;
    saveSectionChoiceAction(remember.kind, remember.section, next).catch((error: unknown) =>
      reportClientError(error, "section-fold")
    );
  };

  return (
    <section aria-labelledby={headingId} className={className}>
      <details onToggle={onToggle} open={open}>
        <summary
          className={`flex cursor-pointer list-none items-baseline gap-2 ${summaryClassName}`.trim()}
        >
          <FoldMarker />
          {summary}
        </summary>
        {children}
      </details>
    </section>
  );
}
