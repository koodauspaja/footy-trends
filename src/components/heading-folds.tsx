import { GROUP_HEADING, TABLE_HEADING } from "@/components/heading-classes";
import { SectionFold } from "@/components/section-fold";
import type { FoldState } from "@/lib/section-keys";

/**
 * A standings table's fold, which always starts open and is never remembered:
 * a group's name differs by competition and season.
 *
 * decisions/071-section-toggles.md
 */
export const TABLE_FOLD: FoldState = { initiallyOpen: true, remember: null };

/**
 * A league's knockout list's fold, which starts closed and is never remembered.
 *
 * decisions/071-section-toggles.md
 */
export const KNOCKOUT_LIST_FOLD: FoldState = { initiallyOpen: false, remember: null };

/**
 * A standings page's section under a table heading, `Runkosarja` or
 * `Pudotuspelit`, as a fold its heading opens and closes.
 *
 * decisions/696-headings-and-spacing.md
 * decisions/071-section-toggles.md
 */
export function TableFold({
  heading,
  headingId,
  fold,
  className = "mb-10",
  children,
}: Readonly<{
  heading: string;
  headingId: string;
  fold: FoldState;
  className?: string;
  children: React.ReactNode;
}>) {
  return (
    <SectionFold
      className={className}
      headingId={headingId}
      initiallyOpen={fold.initiallyOpen}
      remember={fold.remember}
      summary={
        <h2 className={TABLE_HEADING} id={headingId}>
          {heading}
        </h2>
      }
      summaryClassName="mb-3"
    >
      {children}
    </SectionFold>
  );
}

/**
 * One group of `Analyysit`'s panels under its capitals label: a region a
 * screen reader can move between, and a fold its label opens and closes.
 *
 * decisions/424-analytics-panel-groups.md
 * decisions/696-headings-and-spacing.md
 * decisions/071-section-toggles.md
 */
export function GroupFold({
  heading,
  headingId,
  fold,
  children,
}: Readonly<{
  heading: string;
  headingId: string;
  fold: FoldState;
  children: React.ReactNode;
}>) {
  return (
    <SectionFold
      className="mt-12 first-of-type:mt-4"
      headingId={headingId}
      initiallyOpen={fold.initiallyOpen}
      remember={fold.remember}
      summary={
        <h3 className={GROUP_HEADING} id={headingId}>
          {heading}
        </h3>
      }
    >
      {children}
    </SectionFold>
  );
}
