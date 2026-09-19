import { ChartPanel } from "@/components/charts/chart-panel";
import { FormChart } from "@/components/charts/form-chart";
import type { FormSeries } from "@/lib/form-series";

/** The strings agreed in specs/031, each where the spec places it. */
export const FORM_HEADING = "Vire otteluittain";
export const TOO_FEW_MESSAGE = "Vire näytetään, kun joukkue on pelannut vähintään viisi ottelua.";
export const FORM_ERROR_MESSAGE = "Virettä ei voitu laskea. Yritä myöhemmin uudelleen.";

const HEADING_ID = "form-by-match";

/**
 * The form chart's panel in the `Analyysit` section, in every state it can be
 * in (specs/031). `null` means no panel: no league table for this team's
 * season.
 */
export function formPanel(series: FormSeries) {
  if (series.status === "unavailable") return null;

  return (
    <ChartPanel heading={FORM_HEADING} headingId={HEADING_ID}>
      {bodyFor(series)}
    </ChartPanel>
  );
}

function bodyFor(series: Exclude<FormSeries, { status: "unavailable" }>) {
  if (series.status === "too-few") return <p>{TOO_FEW_MESSAGE}</p>;
  if (series.status === "error") return <p>{FORM_ERROR_MESSAGE}</p>;

  return <FormChart headingId={HEADING_ID} points={series.points} title={FORM_HEADING} />;
}
