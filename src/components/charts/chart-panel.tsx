/**
 * One chart inside the team page's `Analyysit` section (specs/031, A): a region
 * named by its own subheading, so a screen reader can move between the charts.
 *
 * **`h4`, because every panel sits inside a group** (#424): `Analyysit` is the
 * `h2`, a group is the `h3`, and a panel is below both. Every use of this
 * component is a panel in a group, so the level is fixed here rather than
 * passed in by ten callers that would all pass the same thing.
 */
export function ChartPanel({
  headingId,
  heading,
  children,
}: Readonly<{ headingId: string; heading: string; children: React.ReactNode }>) {
  return (
    <section aria-labelledby={headingId} className="mt-4">
      <h4 className="mb-2 font-medium text-sm" id={headingId}>
        {heading}
      </h4>
      {children}
    </section>
  );
}
