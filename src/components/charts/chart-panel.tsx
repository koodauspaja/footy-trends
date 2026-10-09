/**
 * One chart inside the team page's `Analyysit` section: a region named by its
 * own subheading, so a screen reader can move between the charts. The heading
 * is an `h4`, as every panel sits inside a group.
 *
 * decisions/031-rolling-form-trend.md
 * decisions/424-analytics-panel-groups.md
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
