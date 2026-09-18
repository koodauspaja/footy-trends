import { PositionChart } from "@/components/charts/position-chart";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { canSeeAnalytics } from "@/lib/analytics-access";
import type { PositionSeries } from "@/lib/position-series";

/** The strings agreed in specs/030, each where the spec places it. */
export const POSITION_HEADING = "Sijoitus kierroksittain";
/** About analytics as a whole, not this chart: signed-out readers see none of them (A). */
export const SIGNED_OUT_MESSAGE = "Kirjaudu sisään nähdäksesi analyysit ja trendit.";
export const NO_ROUNDS_MESSAGE = "Kaudella ei ole vielä pelattuja kierroksia.";
export const POSITION_ERROR_MESSAGE = "Sijoitusta ei voitu laskea. Yritä myöhemmin uudelleen.";
export const SPLIT_NOTE = "Jatkosarjan sijoituksia ei voida laskea tälle kaudelle.";

const HEADING_ID = "sijoitus-kierroksittain";

/**
 * The team page's league-position chart, in every state it can be in
 * (specs/030).
 *
 * **The gate comes first.** A signed-out request is answered with the sign-in
 * prompt before `loadSeries` is called, so its page is never computed from, and
 * carries, any position at all.
 *
 * A server component returning a value rather than a JSX element, because it is
 * awaited by the team pages — the shape `CompetitionTeamPage` already uses.
 * `null` means no section: a league season with no per-round table.
 */
export async function LeaguePositionSection({
  loadSeries,
}: Readonly<{ loadSeries: () => Promise<PositionSeries> }>) {
  if (!(await canSeeAnalytics())) {
    return (
      <Section>
        <SignInPrompt message={SIGNED_OUT_MESSAGE} />
      </Section>
    );
  }

  const series = await loadSeries();
  if (series.status === "unavailable") return null;

  return <Section>{bodyFor(series)}</Section>;
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

function Section({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <section aria-labelledby={HEADING_ID} className="mt-8">
      <h2 className="mb-2 font-medium" id={HEADING_ID}>
        {POSITION_HEADING}
      </h2>
      {children}
    </section>
  );
}
