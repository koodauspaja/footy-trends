import { ChartPanel } from "@/components/charts/chart-panel";
import { CleanSheetChart } from "@/components/charts/clean-sheet-chart";
import { NO_MATCHES_MESSAGE } from "@/components/goals-section";
import type { CleanSheetSeries } from "@/lib/clean-sheets";

/**
 * The panel's strings.
 *
 * decisions/034-clean-sheets.md
 */
export const CLEAN_SHEETS_HEADING = "Nollapelit";
export const CLEAN_SHEETS_ERROR_MESSAGE = "Nollapelejä ei voitu laskea. Yritä myöhemmin uudelleen.";

const HEADING_ID = "clean-sheets";

/**
 * The clean-sheet panel in `Analyysit`. `null` means no panel: no
 * league table for this team's season.
 *
 * decisions/034-clean-sheets.md
 * decisions/032-goals-scored-vs-conceded.md
 */
export function cleanSheetsPanel(series: CleanSheetSeries) {
  if (series.status === "unavailable") return null;

  return (
    <ChartPanel heading={CLEAN_SHEETS_HEADING} headingId={HEADING_ID}>
      {bodyFor(series)}
    </ChartPanel>
  );
}

function bodyFor(series: Exclude<CleanSheetSeries, { status: "unavailable" }>) {
  if (series.status === "error") return <p>{CLEAN_SHEETS_ERROR_MESSAGE}</p>;
  // The goals charts' string: the league exists, it has no finished match yet.
  if (series.points.length === 0) return <p>{NO_MATCHES_MESSAGE}</p>;

  return (
    <CleanSheetChart headingId={HEADING_ID} points={series.points} title={CLEAN_SHEETS_HEADING} />
  );
}
