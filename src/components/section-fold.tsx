"use client";

import { type ReactNode, type SyntheticEvent, useState } from "react";
import { FoldMarker } from "@/components/fold-marker";
import { reportClientError } from "@/lib/report-client-error";
import { saveSectionChoiceAction } from "@/lib/section-choice-actions";
import type { FoldState } from "@/lib/section-keys";

/**
 * The choices this tab has saved, by kind of page and section, so a page the
 * router restores from its cache shows them. Written only in the browser.
 *
 * decisions/071-section-toggles.md
 */
const savedInTab = new Map<string, boolean>();

function keyOf({ kind, section }: NonNullable<FoldState["remember"]>): string {
  return `${kind}/${section}`;
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
  const start =
    (remember === null ? undefined : savedInTab.get(keyOf(remember))) ?? fold.initiallyOpen;
  const [open, setOpen] = useState(start);
  const [rendered, setRendered] = useState(start);
  // A navigation that keeps this fold and renders it otherwise, another season
  // for one, starts it over.
  if (start !== rendered) {
    setRendered(start);
    setOpen(start);
  }

  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const next = event.currentTarget.open;
    // A nested fold's toggle reaches this handler too, and the browser also
    // announces the state the fold was rendered in.
    if (event.target !== event.currentTarget || next === open) return;
    setOpen(next);
    if (remember === null) return;
    savedInTab.set(keyOf(remember), next);
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
