import { ChartPanel } from "@/components/charts/chart-panel";
import { PositionChart } from "@/components/charts/position-chart";
import type { PositionSeries } from "@/lib/position-series";

/**
 * The panel's strings.
 *
 * decisions/030-league-position-by-matchday.md
 */
export const POSITION_HEADING = "Sijoitus kierroksittain";
export const NO_ROUNDS_MESSAGE = "Kaudella ei ole vielä pelattuja kierroksia.";
export const POSITION_ERROR_MESSAGE = "Sijoitusta ei voitu laskea. Yritä myöhemmin uudelleen.";
export const SPLIT_NOTE = "Jatkosarjan sijoituksia ei voida laskea tälle kaudelle.";

const HEADING_ID = "league-position-by-round";

/**
 * The league-position chart's panel in the `Analyysit` section, in every state
 * it can be in. A plain function, not a component: `null` means no panel, a
 * league season with no per-round table. The sign-in gate is the section's.
 *
 * decisions/030-league-position-by-matchday.md
 * decisions/031-rolling-form-trend.md
 */
export function positionPanel(series: PositionSeries) {
  if (series.status === "unavailable") return null;

  return (
    <ChartPanel heading={POSITION_HEADING} headingId={HEADING_ID}>
      {bodyFor(series)}
    </ChartPanel>
  );
}

function bodyFor(series: Exclude<PositionSeries, { status: "unavailable" }>) {
  if (series.status === "no-rounds") return <p>{NO_ROUNDS_MESSAGE}</p>;
  if (series.status === "error") return <p>{POSITION_ERROR_MESSAGE}</p>;

  return (
    <>
      <PositionChart
        headingId={HEADING_ID}
        points={series.points}
        teamCount={series.teamCount}
        title={POSITION_HEADING}
      />
      {series.endsAtSplit ? <p className="mt-2 text-muted text-sm">{SPLIT_NOTE}</p> : null}
    </>
  );
}
