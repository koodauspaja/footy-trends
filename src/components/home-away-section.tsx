import { ChartPanel } from "@/components/charts/chart-panel";
import { HomeAwayChart } from "@/components/charts/home-away-chart";
import { NO_MATCHES_MESSAGE } from "@/components/goals-section";
import type { HomeAwaySeries } from "@/lib/home-away";

/** The strings agreed in specs/033, each where the spec places it. */
export const HOME_AWAY_HEADING = "Koti- ja vierastilastot";
export const HOME_AWAY_ERROR_MESSAGE =
  "Koti- ja vierasotteluja ei voitu laskea. Yritä myöhemmin uudelleen.";

const HEADING_ID = "home-and-away";

/**
 * The home-and-away panel in `Analyysit` (specs/033). `null` means no panel: no
 * league table for this team's season.
 */
export function homeAwayPanel(series: HomeAwaySeries) {
  if (series.status === "unavailable") return null;

  return (
    <ChartPanel heading={HOME_AWAY_HEADING} headingId={HEADING_ID}>
      {bodyFor(series)}
    </ChartPanel>
  );
}

function bodyFor(series: Exclude<HomeAwaySeries, { status: "unavailable" }>) {
  if (series.status === "error") return <p>{HOME_AWAY_ERROR_MESSAGE}</p>;
  // specs/032's string: the league exists, it has no finished match yet.
  if (series.home.matches + series.away.matches === 0) return <p>{NO_MATCHES_MESSAGE}</p>;

  return (
    <HomeAwayChart
      away={series.away}
      headingId={HEADING_ID}
      home={series.home}
      title={HOME_AWAY_HEADING}
    />
  );
}
