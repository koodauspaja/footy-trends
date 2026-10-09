import Link from "next/link";
import { percentText } from "@/components/charts/line-chart";
import { ROUNDING_NOTE } from "@/components/competition-analytics";
import { ELO_ERROR_MESSAGE } from "@/components/elo-section";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { canSeeAnalytics } from "@/lib/analytics-access";
import { ELO_HOME_ADVANTAGE, predictElo } from "@/lib/elo";
import { type EloRatings, getEloRatings } from "@/lib/elo-service";
import { baselineCompetition, type HomeBaseline } from "@/lib/home-baseline";
import { teamDisplayName } from "@/lib/match-detail";
import { getHomeBaseline, type StoredMatch } from "@/lib/match-service";
import { formatSeasonLabel } from "@/lib/seasons";

/**
 * The section's strings.
 *
 * decisions/051-home-win-baseline.md
 */
export const PREDICTION_HEADING = "Ennuste";
export const PREDICTION_ERROR_MESSAGE = "Ennustetta ei voitu laskea. Yritä myöhemmin uudelleen.";
export const NO_HISTORY_MESSAGE = "Kilpailusta ei ole vielä tallennettuja otteluita.";
export const PREDICTION_SIGNED_OUT_MESSAGE = "Kirjaudu sisään nähdäksesi ennusteen.";
/**
 * The baseline's row, beside the Elo row.
 *
 * decisions/053-elo-ratings.md
 */
export const BASELINE_ROW = "Perustaso";
export const ELO_ROW = "Elo";
/**
 * The link to the models' track record, from every `Ennuste`.
 *
 * decisions/054-prediction-quality.md
 */
export const QUALITY_LINK = "Kuinka hyvin ennusteet ovat osuneet?";

const SAME_FOR_EVERY_MATCH =
  "Ei huomioi joukkueita, joten ennuste on sama jokaiselle kilpailun ottelulle.";

const HEADING_ID = "ennuste";

/**
 * `1 234`: a Finnish count, a no-break space between the thousands.
 *
 * decisions/051-home-win-baseline.md
 */
function countText(count: number): string {
  return new Intl.NumberFormat("fi-FI").format(count);
}

/**
 * What the shares rest on, from the data rather than literals: the
 * match count and the seasons, then that the teams are not considered. One
 * match or one season is written in the singular.
 *
 * decisions/051-home-win-baseline.md
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

/**
 * The Elo line: both teams' ratings, rounded, then how the
 * prediction is made from them.
 *
 * decisions/053-elo-ratings.md
 */
export function eloSentence(
  homeName: string,
  homeRating: number,
  awayName: string,
  awayRating: number
): string {
  return `Elo: ${homeName} ${Math.round(homeRating)}, ${awayName} ${Math.round(awayRating)}. Kotijoukkueelle lisätään ${ELO_HOME_ADVANTAGE} pistettä, ja tasapelin todennäköisyys on kilpailun tasapelien osuus.`;
}

/**
 * One model's row: its name and three shares, 0–100.
 *
 * decisions/053-elo-ratings.md
 */
type PredictionRow = { model: string; home: number; draw: number; away: number };

/**
 * The three outcomes' headings, in their order.
 *
 * decisions/053-elo-ratings.md
 */
const OUTCOMES = ["Kotivoitto", "Tasapeli", "Vierasvoitto"] as const;

/**
 * The predictions as a small table that sizes to its content: three outcome
 * columns and two rows fit a phone, where `DataTable`'s 240px name column
 * would push `Tasapeli` and `Vierasvoitto` off the screen.
 *
 * decisions/053-elo-ratings.md
 */
function PredictionTable({ rows }: Readonly<{ rows: readonly PredictionRow[] }>) {
  return (
    <table className="text-sm">
      <thead>
        <tr className="border-border border-b text-muted">
          <th scope="col">
            <span className="sr-only">Malli</span>
          </th>
          {OUTCOMES.map((outcome) => (
            <th className="py-2 pl-4 text-right font-medium" key={outcome} scope="col">
              {outcome}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr className="border-border border-b" key={row.model}>
            <th className="py-2 pr-2 text-left font-semibold" scope="row">
              {row.model}
            </th>
            {[row.home, row.draw, row.away].map((share, index) => (
              <td className="py-2 pl-4 text-right tabular-nums" key={OUTCOMES[index]}>
                {percentText(share)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The two teams as the panel names them, and their ids.
 *
 * decisions/053-elo-ratings.md
 */
type Sides = {
  homeTeam: number;
  awayTeam: number;
  homeName: string;
  awayName: string;
  seasonId: number;
};

function Body({
  baseline,
  elo,
  sides,
}: Readonly<{ baseline: HomeBaseline; elo: EloRatings; sides: Sides }>) {
  if (baseline.status === "error") return <p>{PREDICTION_ERROR_MESSAGE}</p>;
  if (baseline.status === "empty") return <p>{NO_HISTORY_MESSAGE}</p>;

  const rows: PredictionRow[] = [
    {
      model: BASELINE_ROW,
      home: baseline.homeShare,
      draw: baseline.drawShare,
      away: baseline.awayShare,
    },
  ];
  // No Elo row for a placeholder side; the baseline still stands.
  const prediction =
    elo.status === "ok"
      ? predictElo(
          elo.ratings,
          sides.homeTeam,
          sides.awayTeam,
          sides.seasonId,
          baseline.drawShare / 100
        )
      : null;
  if (prediction !== null) {
    rows.push({
      model: ELO_ROW,
      home: prediction.prediction.home * 100,
      draw: prediction.prediction.draw * 100,
      away: prediction.prediction.away * 100,
    });
  }

  return (
    <div>
      <PredictionTable rows={rows} />
      <p className="mt-2 text-muted text-sm">{baselineSentence(baseline)}</p>
      {prediction === null ? null : (
        <p className="mt-2 text-muted text-sm">
          {eloSentence(
            sides.homeName,
            prediction.homeRating,
            sides.awayName,
            prediction.awayRating
          )}
        </p>
      )}
      {elo.status === "error" ? <p className="mt-2">{ELO_ERROR_MESSAGE}</p> : null}
      <p className="mt-2 text-muted text-sm">{ROUNDING_NOTE}</p>
      <p className="mt-2 text-sm">
        <Link className="hover:underline" href="/ennusteet">
          {QUALITY_LINK}
        </Link>
      </p>
    </div>
  );
}

/**
 * The match page's `Ennuste`: the competition's home-win baseline and, beside
 * it, the Elo prediction, on an upcoming match in a compared competition, or
 * nothing. Gated before anything is read; awaited by the page, not rendered.
 *
 * decisions/049-home-advantage-and-draw-rate.md
 * decisions/051-home-win-baseline.md
 * decisions/053-elo-ratings.md
 */
export async function MatchPrediction({ stored }: Readonly<{ stored: StoredMatch }>) {
  const competition = baselineCompetition(stored);
  if (competition === null) return null;

  const signedIn = await canSeeAnalytics();
  let body: React.ReactNode = <SignInPrompt message={PREDICTION_SIGNED_OUT_MESSAGE} />;
  if (signedIn) {
    const [baseline, elo] = await Promise.all([
      getHomeBaseline(competition.kind, competition.code),
      getEloRatings(competition.kind),
    ]);
    const { match } = stored;
    const sides = {
      homeTeam: match.homeTeamProviderId,
      awayTeam: match.awayTeamProviderId,
      homeName: teamDisplayName(match.homeTeamProviderId, match.homeTeamName),
      awayName: teamDisplayName(match.awayTeamProviderId, match.awayTeamName),
      seasonId: match.seasonId,
    };
    body = <Body baseline={baseline} elo={elo} sides={sides} />;
  }

  return (
    <section aria-labelledby={HEADING_ID} className="mt-10">
      <h2 className="mb-2 font-semibold text-xl" id={HEADING_ID}>
        {PREDICTION_HEADING}
      </h2>
      {body}
    </section>
  );
}
