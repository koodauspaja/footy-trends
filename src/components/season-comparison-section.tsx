import { ChartPanel } from "@/components/charts/chart-panel";
import { SeasonComparisonChart } from "@/components/charts/season-comparison-chart";
import { NO_MATCHES_MESSAGE } from "@/components/goals-section";
import type { AnalyticsAxis } from "@/lib/analytics-axis";
import type { SeasonComparisonSeries } from "@/lib/season-comparison";

/**
 * The strings agreed in specs/038, each where the spec places it.
 *
 * The heading, the baseline line and the no-others message all name a period,
 * so they come from the page's axis rather than from here — a season on a club
 * page, a calendar year on a national-team page (specs/041, S11).
 */
export const COMPARISON_ERROR_MESSAGE =
  "Kausivertailua ei voitu laskea. Yritä myöhemmin uudelleen.";

const HEADING_ID = "season-comparison";

/**
 * The comparison panel in `Analyysit` (specs/038). `null` means no panel: no
 * league table for this team's season.
 *
 * A club with no other stored league season still gets the panel, with a line
 * saying why there is nothing to compare against — the page must not change
 * shape as a club's history grows, and this is exactly where a reader asks
 * whether a season is normal.
 */
export function seasonComparisonPanel(series: SeasonComparisonSeries, axis: AnalyticsAxis) {
  if (series.status === "unavailable") return null;

  return (
    <ChartPanel heading={axis.comparisonHeading} headingId={HEADING_ID}>
      {bodyFor(series, axis)}
    </ChartPanel>
  );
}

function bodyFor(
  series: Exclude<SeasonComparisonSeries, { status: "unavailable" }>,
  axis: AnalyticsAxis
) {
  if (series.status === "error") return <p>{COMPARISON_ERROR_MESSAGE}</p>;
  // specs/032's string: the league exists, it has no finished match yet.
  if (series.rows.every((row) => row.selected === null)) return <p>{NO_MATCHES_MESSAGE}</p>;

  // A club with no other season still sees its own values; the baseline column
  // is empty — every bar `–` rather than 0 — and the line says why.
  return (
    <div>
      <p className="text-muted text-sm">
        {series.seasons === 0
          ? axis.noOthersMessage
          : axis.baselineLine(series.seasons, series.competitions)}
      </p>
      <SeasonComparisonChart
        axis={axis}
        headingId={HEADING_ID}
        rows={series.rows}
        teamCount={series.teamCount}
      />
    </div>
  );
}
