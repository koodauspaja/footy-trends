import { percentText } from "@/components/charts/line-chart";
import { ROUNDING_NOTE } from "@/components/competition-analytics";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { canSeeAnalytics } from "@/lib/analytics-access";
import { baselineCompetition, type HomeBaseline } from "@/lib/home-baseline";
import { getHomeBaseline, type StoredMatch } from "@/lib/match-service";
import { formatSeasonLabel } from "@/lib/seasons";

/** The strings agreed in specs/051, each where the spec places it. */
export const PREDICTION_HEADING = "Ennuste";
export const PREDICTION_ERROR_MESSAGE = "Ennustetta ei voitu laskea. Yritä myöhemmin uudelleen.";
export const NO_HISTORY_MESSAGE = "Kilpailusta ei ole vielä tallennettuja otteluita.";
export const PREDICTION_SIGNED_OUT_MESSAGE = "Kirjaudu sisään nähdäksesi ennusteen.";
const SAME_FOR_EVERY_MATCH =
  "Ei huomioi joukkueita, joten ennuste on sama jokaiselle kilpailun ottelulle.";

const HEADING_ID = "ennuste";

/** `1 234`: a Finnish count, a no-break space between the thousands. */
function countText(count: number): string {
  return new Intl.NumberFormat("fi-FI").format(count);
}

/**
 * What the shares rest on, from the data rather than literals (S2, S8): the
 * match count and the seasons, then that the teams are not considered. One
 * match or one season is written in the singular.
 */
export function baselineSentence(baseline: Extract<HomeBaseline, { status: "ok" }>): string {
  const { matches, seasons, spansCalendarYears } = baseline;
  const results =
    matches === 1
      ? "kilpailun 1 ottelun tulos"
      : `kilpailun ${countText(matches)} ottelun tulokset`;
  const first = formatSeasonLabel(seasons.first, spansCalendarYears);
  const last = formatSeasonLabel(seasons.last, spansCalendarYears);
  const period = first === last ? `kaudelta ${first}` : `kausilta ${first}–${last}`;
  return `Perustaso: ${results} ${period}. ${SAME_FOR_EVERY_MATCH}`;
}

function Outcome({ label, share }: Readonly<{ label: string; share: number }>) {
  return (
    <div>
      <dt className="inline">{label}</dt>{" "}
      <dd className="inline font-semibold">{percentText(share)}</dd>
    </div>
  );
}

function Body({ baseline }: Readonly<{ baseline: HomeBaseline }>) {
  if (baseline.status === "error") return <p>{PREDICTION_ERROR_MESSAGE}</p>;
  if (baseline.status === "empty") return <p>{NO_HISTORY_MESSAGE}</p>;
  return (
    <div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1">
        <Outcome label="Kotivoitto" share={baseline.homeShare} />
        <Outcome label="Tasapeli" share={baseline.drawShare} />
        <Outcome label="Vierasvoitto" share={baseline.awayShare} />
      </dl>
      <p className="mt-2 text-muted text-sm">{baselineSentence(baseline)}</p>
      <p className="mt-2 text-muted text-sm">{ROUNDING_NOTE}</p>
    </div>
  );
}

/**
 * The match page's `Ennuste` (specs/051): the competition's home-win baseline,
 * on an upcoming match in a competition specs/049 compares, or nothing.
 *
 * The analytics gate is asked before anything is read, so a signed-out page
 * carries no probability (S4). Awaited by the page rather than rendered, as
 * `CompetitionAnalyticsSection` is.
 */
export async function MatchPrediction({ stored }: Readonly<{ stored: StoredMatch }>) {
  const competition = baselineCompetition(stored);
  if (competition === null) return null;

  const signedIn = await canSeeAnalytics();
  const body = signedIn ? (
    <Body baseline={await getHomeBaseline(competition.kind, competition.code)} />
  ) : (
    <SignInPrompt message={PREDICTION_SIGNED_OUT_MESSAGE} />
  );

  return (
    <section aria-labelledby={HEADING_ID} className="mt-10">
      <h2 className="mb-2 font-semibold text-xl" id={HEADING_ID}>
        {PREDICTION_HEADING}
      </h2>
      {body}
    </section>
  );
}
