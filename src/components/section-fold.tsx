"use client";

import { type ReactNode, type SyntheticEvent, useState } from "react";
import { FoldMarker } from "@/components/fold-marker";
import { reportClientError } from "@/lib/report-client-error";
import { saveSectionChoiceAction } from "@/lib/section-choice-actions";
import type { FoldState, RememberedSection } from "@/lib/section-keys";

/**
 * The choices this tab has stored, by kind of page and section. A remembered
 * fold mounts with them until a reload, so a page the router restores from its
 * cache shows them too. Written only in the browser.
 *
 * decisions/071-section-toggles.md
 */
const savedInTab = new Map<string, boolean>();

function keyOf({ kind, section }: RememberedSection): string {
  return `${kind}/${section}`;
}

/**
 * Where a fold starts: the choice this tab stored, else its render's.
 *
 * decisions/071-section-toggles.md
 */
function startOf({ initiallyOpen, remember }: FoldState): boolean {
  return (remember === null ? undefined : savedInTab.get(keyOf(remember))) ?? initiallyOpen;
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
  const [open, setOpen] = useState(() => startOf(fold));
  const [rendered, setRendered] = useState(fold.initiallyOpen);
  // A navigation that keeps this fold and renders it otherwise, another season
  // for one, starts it over.
  if (fold.initiallyOpen !== rendered) {
    setRendered(fold.initiallyOpen);
    setOpen(startOf(fold));
  }

  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const next = event.currentTarget.open;
    // A nested fold's toggle reaches this handler too, and the browser also
    // announces the state the fold was rendered in.
    if (event.target !== event.currentTarget || next === open) return;
    setOpen(next);
    if (remember === null) return;
    saveSectionChoiceAction(remember.kind, remember.section, next).then(
      ({ ok }) => {
        if (ok) savedInTab.set(keyOf(remember), next);
      },
      (error: unknown) => reportClientError(error, "section-fold")
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
