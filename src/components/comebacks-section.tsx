import { ChartPanel } from "@/components/charts/chart-panel";
import type { ComebacksSeries, HalfTimeOutcomes } from "@/lib/comebacks";

/** The strings agreed in specs/036 (Q5) and specs/037 (Q2, Q3, Q5, Q6). */
export const COMEBACKS_HEADING = "Kääntyneet ottelut";
export const TRAILED_LABEL = "Tappioasemassa puoliajalla";
export const WON_LABEL = "Käännetty voitoksi";
export const DREW_LABEL = "Tasoitettu";
export const LED_LABEL = "Johdossa puoliajalla";
export const LED_DREW_LABEL = "Valunut tasapeliksi";
export const LED_LOST_LABEL = "Käännetty tappioksi";
export const NO_DEFICIT_MESSAGE = "Ei vielä otteluita tappioasemasta.";
export const NO_LEAD_MESSAGE = "Ei vielä otteluita johtoasemasta.";
export const NO_HALF_TIME_MESSAGE = "Puoliaikatuloksia ei ole tälle kaudelle.";
export const COMEBACKS_ERROR_MESSAGE =
  "Kääntyneitä otteluita ei voitu laskea. Yritä myöhemmin uudelleen.";

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
 * What became of the team's matches after half-time, in `Analyysit`
 * (specs/036, specs/037): the deficits it rescued and the leads it gave away,
 * six figures rather than a chart. `null` means no panel: no league table for
 * this team's season.
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
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Direction
          outcomes={series.trailed}
          total={TRAILED_LABEL}
          rows={[
            [WON_LABEL, series.trailed.won],
            [DREW_LABEL, series.trailed.drew],
          ]}
          empty={NO_DEFICIT_MESSAGE}
        />
        <Direction
          outcomes={series.led}
          total={LED_LABEL}
          rows={[
            [LED_DREW_LABEL, series.led.drew],
            [LED_LOST_LABEL, series.led.lost],
          ]}
          empty={NO_LEAD_MESSAGE}
        />
      </div>
      {/*
       * Once for the panel, not once per direction: both count out of the same
       * matches, so two identical lines would read as two separate gaps
       * (specs/037, Q1).
       */}
      {series.missing > 0 && (
        <p className="mt-4 text-muted text-sm">{missingText(series.missing)}</p>
      )}
    </>
  );
}

/**
 * One direction: its total, then the two outcomes that changed it. The third
 * outcome — trailed and lost, led and won — is implied rather than shown
 * (specs/037).
 *
 * A direction with no matches says so instead of showing zeroes: one side can
 * be empty while the other is not, and three zeroes read as a measured result
 * rather than "this has not happened".
 */
function Direction({
  outcomes,
  total,
  rows,
  empty,
}: Readonly<{
  outcomes: HalfTimeOutcomes;
  total: string;
  rows: ReadonlyArray<readonly [string, number]>;
  empty: string;
}>) {
  if (outcomes.matches === 0) return <p>{empty}</p>;

  return (
    <dl className="grid gap-y-2">
      <Figure label={total} value={outcomes.matches} />
      {rows.map(([label, value]) => (
        <Figure key={label} label={label} value={value} />
      ))}
    </dl>
  );
}

/** One figure: its name, and how many matches it counts. */
function Figure({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div>
      <dt className="text-muted text-sm">{label}</dt>
      <dd>{matchCount(value)}</dd>
    </div>
  );
}
