/**
 * One chart inside the team page's `Analyysit` section (specs/031, A): a region
 * named by its own subheading, so a screen reader can move between the charts.
 */
export function ChartPanel({
  headingId,
  heading,
  children,
}: Readonly<{ headingId: string; heading: string; children: React.ReactNode }>) {
  return (
    <section aria-labelledby={headingId} className="mt-4">
      <h3 className="mb-2 font-medium text-sm" id={headingId}>
        {heading}
      </h3>
      {children}
    </section>
  );
}
