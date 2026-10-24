"use client";

import { type ReactNode, useState } from "react";
import { FoldMarker } from "@/components/fold-marker";
import { reportClientError } from "@/lib/report-client-error";
import { saveSectionChoiceAction } from "@/lib/section-choice-actions";
import type { PageKind } from "@/lib/section-keys";

/**
 * A section a reader can fold away and back: a region named by its heading, in
 * a `<details>` whose summary holds that heading. A toggle is saved when
 * `remember` names the section, which only a signed-in reader's fold does, and
 * a failed save leaves the fold as the reader set it.
 *
 * decisions/416-team-page-folds.md
 * decisions/419-shared-fold-marker.md
 * decisions/071-section-toggles.md
 */
export function SectionFold({
  headingId,
  summary,
  initiallyOpen,
  remember,
  className,
  summaryClassName = "",
  children,
}: Readonly<{
  headingId: string;
  /** The heading, and anything after it such as a count. */
  summary: ReactNode;
  initiallyOpen: boolean;
  remember: { kind: PageKind; section: string } | null;
  className?: string;
  summaryClassName?: string;
  children: ReactNode;
}>) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <section aria-labelledby={headingId} className={className}>
      <details
        className="group"
        onToggle={(event) => {
          const next = event.currentTarget.open;
          // The browser also announces the state the fold was rendered in.
          if (next === open) return;
          setOpen(next);
          if (remember === null) return;
          saveSectionChoiceAction(remember.kind, remember.section, next).catch((error: unknown) =>
            reportClientError(error, "section-fold")
          );
        }}
        open={open}
      >
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
