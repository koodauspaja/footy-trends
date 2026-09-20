import { ChartPanel } from "@/components/charts/chart-panel";
import type { Comebacks, ComebacksSeries } from "@/lib/comebacks";

/** The strings agreed in specs/036 (Q5), each where the spec places it. */
export const COMEBACKS_HEADING = "Käännetyt ottelut";
export const TRAILED_LABEL = "Tappioasemassa puoliajalla";
export const WON_LABEL = "Käännetty voitoksi";
export const DREW_LABEL = "Tasoitettu";
export const NO_DEFICIT_MESSAGE = "Ei vielä otteluita tappioasemasta.";
export const NO_HALF_TIME_MESSAGE = "Puoliaikatuloksia ei ole tälle kaudelle.";
export const COMEBACKS_ERROR_MESSAGE =
  "Käännettyjä otteluita ei voitu laskea. Yritä myöhemmin uudelleen.";

const HEADING_ID = "comebacks";

/** `1 ottelu` / `3 ottelua`: Finnish counts one thing differently. */
export function matchCount(count: number): string {
  return `${count} ${count === 1 ? "ottelu" : "ottelua"}`;
}

/**
 * How many matches the panel could not read a half-time score for. The
 * elative is the same for one as for many (`1 ottelusta`, `5 ottelusta`), so
 * unlike {@link matchCount} this needs no singular form.
 */
export function missingText(missing: number): string {
  return `Puoliaikatulos puuttuu ${missing} ottelusta.`;
}

/**
 * The comebacks panel in `Analyysit` (specs/036): three figures, not a chart.
 * `null` means no panel: no league table for this team's season.
 */
export function comebacksPanel(series: ComebacksSeries) {
  if (series.status === "unavailable") return null;

  return (
    <ChartPanel heading={COMEBACKS_HEADING} headingId={HEADING_ID}>
      {bodyFor(series)}
    </ChartPanel>
  );
}

function bodyFor(series: Exclude<ComebacksSeries, { status: "unavailable" }>) {
  if (series.status === "error") return <p>{COMEBACKS_ERROR_MESSAGE}</p>;
  // Nothing to be out of: an old football-data season the provider refuses, or
  // a season not backfilled yet. Zeroes would read as "never trailed" (Q4).
  if (series.known === 0) return <p>{NO_HALF_TIME_MESSAGE}</p>;

  return (
    <>
      {series.trailed === 0 ? <p>{NO_DEFICIT_MESSAGE}</p> : <Figures {...series} />}
      {series.missing > 0 && (
        <p className="mt-2 text-muted text-sm">{missingText(series.missing)}</p>
      )}
    </>
  );
}

/**
 * The three figures. Shown whenever the team trailed at half-time in a match
 * that has a half-time score, even if others are missing one (Q4).
 */
function Figures({ trailed, won, drew }: Readonly<Comebacks>) {
  const figures = [
    [TRAILED_LABEL, trailed],
    [WON_LABEL, won],
    [DREW_LABEL, drew],
  ] as const;

  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {figures.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted text-sm">{label}</dt>
          <dd>{matchCount(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
