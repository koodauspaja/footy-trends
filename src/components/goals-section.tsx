import { ChartPanel } from "@/components/charts/chart-panel";
import {
  GoalsChart,
  ROLLING_TOP,
  rollingSentence,
  totalsSentence,
  totalsTicks,
  totalsTop,
} from "@/components/charts/goals-chart";
import { ticksFor } from "@/components/charts/line-chart";
import type { GoalsSeries } from "@/lib/goals-series";

/** The strings agreed in specs/032, each where the spec places it. */
export const ROLLING_HEADING = "Maalit otteluittain";
export const TOTALS_HEADING = "Maalit yhteensä";
export const ROLLING_TOO_FEW_MESSAGE =
  "Maalit näytetään, kun joukkue on pelannut vähintään viisi ottelua.";
export const NO_MATCHES_MESSAGE = "Kaudella ei ole vielä pelattuja otteluita.";
export const GOALS_ERROR_MESSAGE = "Maaleja ei voitu laskea. Yritä myöhemmin uudelleen.";

const ROLLING_ID = "goals-by-match";
const TOTALS_ID = "goals-in-total";

/**
 * The rolling goals chart's panel in `Analyysit` (specs/032): per match over the
 * last five, from the fifth match, on a fixed 0–5 axis. `null` means no panel —
 * no league table for this team's season.
 */
export function rollingGoalsPanel(series: GoalsSeries) {
  if (series.status === "unavailable") return null;

  return (
    <ChartPanel heading={ROLLING_HEADING} headingId={ROLLING_ID}>
      {rollingBody(series)}
    </ChartPanel>
  );
}

/**
 * The running-total goals chart's panel in `Analyysit` (specs/032): from the
 * first match, the last point being the table's `TM` and `PM`.
 */
export function totalGoalsPanel(series: GoalsSeries) {
  if (series.status === "unavailable") return null;

  return (
    <ChartPanel heading={TOTALS_HEADING} headingId={TOTALS_ID}>
      {totalsBody(series)}
    </ChartPanel>
  );
}

function rollingBody(series: Exclude<GoalsSeries, { status: "unavailable" }>) {
  if (series.status === "error") return <p>{GOALS_ERROR_MESSAGE}</p>;
  if (series.rolling.length === 0) return <p>{ROLLING_TOO_FEW_MESSAGE}</p>;

  return (
    <GoalsChart
      headingId={ROLLING_ID}
      points={series.rolling}
      sentence={rollingSentence}
      title={ROLLING_HEADING}
      yLabel="Maaleja / ottelu"
      yTicks={ticksFor(0, ROLLING_TOP, ROLLING_TOP + 1)}
      yTop={ROLLING_TOP}
    />
  );
}

function totalsBody(series: Exclude<GoalsSeries, { status: "unavailable" }>) {
  if (series.status === "error") return <p>{GOALS_ERROR_MESSAGE}</p>;
  if (series.totals.length === 0) return <p>{NO_MATCHES_MESSAGE}</p>;

  const top = totalsTop(series.totals);
  return (
    <GoalsChart
      headingId={TOTALS_ID}
      points={series.totals}
      sentence={totalsSentence}
      title={TOTALS_HEADING}
      yLabel="Maaleja"
      yTicks={totalsTicks(top)}
      yTop={top}
    />
  );
}
