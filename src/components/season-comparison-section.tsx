import { ChartPanel } from "@/components/charts/chart-panel";
import { SeasonComparisonChart } from "@/components/charts/season-comparison-chart";
import { NO_MATCHES_MESSAGE } from "@/components/goals-section";
import type { SeasonComparisonSeries } from "@/lib/season-comparison";

/** The strings agreed in specs/038, each where the spec places it. */
export const COMPARISON_HEADING = "Tämä kausi verrattuna";
export const COMPARISON_ERROR_MESSAGE =
  "Kausivertailua ei voitu laskea. Yritä myöhemmin uudelleen.";
/** Miikka's wording: the club has no other stored league season to compare with. */
export const NO_OTHER_SEASONS_MESSAGE = "Joukkueelle ei löydy otteluita muilta kausilta.";

const HEADING_ID = "season-comparison";

/** `Verrattuna 11 muuhun kauteen: Veikkausliiga, Ykkönen` (specs/038). */
export function baselineLine(seasons: number, competitions: readonly string[]): string {
  return `Verrattuna ${seasons} muuhun kauteen: ${competitions.join(", ")}`;
}

/**
 * The comparison panel in `Analyysit` (specs/038). `null` means no panel: no
 * league table for this team's season.
 *
 * A club with no other stored league season still gets the panel, with a line
 * saying why there is nothing to compare against — the page must not change
 * shape as a club's history grows, and this is exactly where a reader asks
 * whether a season is normal.
 */
export function seasonComparisonPanel(series: SeasonComparisonSeries) {
  if (series.status === "unavailable") return null;

  return (
    <ChartPanel heading={COMPARISON_HEADING} headingId={HEADING_ID}>
      {bodyFor(series)}
    </ChartPanel>
  );
}

function bodyFor(series: Exclude<SeasonComparisonSeries, { status: "unavailable" }>) {
  if (series.status === "error") return <p>{COMPARISON_ERROR_MESSAGE}</p>;
  // specs/032's string: the league exists, it has no finished match yet.
  if (series.rows.every((row) => row.selected === null)) return <p>{NO_MATCHES_MESSAGE}</p>;

  // A club with no other season still sees its own values; the baseline column
  // is empty — every bar `–` rather than 0 — and the line says why.
  return (
    <div>
      <p className="text-muted text-sm">
        {series.seasons === 0
          ? NO_OTHER_SEASONS_MESSAGE
          : baselineLine(series.seasons, series.competitions)}
      </p>
      <SeasonComparisonChart
        headingId={HEADING_ID}
        rows={series.rows}
        teamCount={series.teamCount}
        title={COMPARISON_HEADING}
      />
    </div>
  );
}
