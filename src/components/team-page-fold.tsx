import { SectionFold } from "@/components/section-fold";
import type { FoldState } from "@/lib/section-keys";

/**
 * The match list's heading; its count follows it, `Ottelut (24 ottelua)`.
 *
 * decisions/416-team-page-folds.md
 */
export const MATCHES_HEADING = "Ottelut";

/**
 * A part of a team page a reader can fold away and back: the match list and
 * `Analyysit`, each under an `h2`. It starts as the reader last left it on
 * this kind of page, signed in, or else as its default.
 *
 * decisions/416-team-page-folds.md
 * decisions/419-shared-fold-marker.md
 * decisions/071-section-toggles.md
 */
export function TeamPageFold({
  heading,
  headingId,
  count,
  className = "mt-8",
  fold,
  children,
}: Readonly<{
  heading: string;
  headingId: string;
  /** Shown after the heading in brackets, e.g. `24 ottelua`. */
  count?: string;
  className?: string;
  fold: FoldState;
  children: React.ReactNode;
}>) {
  return (
    <SectionFold
      className={className}
      fold={fold}
      headingId={headingId}
      summary={
        <>
          <h2 className="font-medium" id={headingId}>
            {heading}
          </h2>
          {count === undefined ? null : <span className="text-muted text-sm">({count})</span>}
        </>
      }
      summaryClassName="mb-2"
    >
      {children}
    </SectionFold>
  );
}
