import { FoldMarker } from "@/components/fold-marker";

/**
 * The match list's heading; its count follows it, `Ottelut (24 ottelua)`.
 *
 * decisions/416-team-page-folds.md
 */
export const MATCHES_HEADING = "Ottelut";

/**
 * A part of the team page a reader can fold away and back: the match list and
 * `Analyysit`. A `<details>`, open by default, and a region named by its
 * heading. The fold resets on every load.
 *
 * decisions/416-team-page-folds.md
 * decisions/419-shared-fold-marker.md
 */
export function TeamPageFold({
  heading,
  headingId,
  count,
  className = "mt-8",
  children,
}: Readonly<{
  heading: string;
  headingId: string;
  /** Shown after the heading in brackets, e.g. `24 ottelua`. */
  count?: string;
  className?: string;
  children: React.ReactNode;
}>) {
  return (
    <section aria-labelledby={headingId} className={className}>
      <details className="group" open>
        <summary className="mb-2 flex cursor-pointer list-none items-baseline gap-2">
          <FoldMarker />
          <h2 className="font-medium" id={headingId}>
            {heading}
          </h2>
          {count === undefined ? null : <span className="text-muted text-sm">({count})</span>}
        </summary>
        {children}
      </details>
    </section>
  );
}
