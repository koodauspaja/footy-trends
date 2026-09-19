/** The match list's heading; its count follows it, `Ottelut (24 ottelua)` (#416). */
export const MATCHES_HEADING = "Ottelut";

/**
 * A part of the team page a reader can fold away and back: the match list and
 * `Analyysit` (#416).
 *
 * `<details>` rather than client-side state, as the Huuhkajat years and the cup
 * rounds use, and open by default for the same reason: nothing is hidden until
 * the reader chooses to hide it. The fold resets on every load, including a
 * season change — the accepted cost of keeping no state.
 *
 * Unlike those two, the summary shows a marker that turns when the section
 * opens, so the heading reads as something to press. It is `aria-hidden`: the
 * `<details>` element already tells a screen reader whether it is open.
 *
 * A region named by its heading, so a screen reader can move between the parts
 * of the page whether they are folded or not.
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
          <span
            aria-hidden="true"
            className="inline-block text-muted transition-transform group-open:rotate-90"
          >
            ▸
          </span>
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
