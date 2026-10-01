import { percentText } from "@/components/charts/line-chart";
import { ROUNDING_NOTE } from "@/components/competition-analytics";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { ELO_ERROR_MESSAGE } from "@/components/elo-section";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { canSeeAnalytics } from "@/lib/analytics-access";
import { ELO_HOME_ADVANTAGE, predictElo } from "@/lib/elo";
import { type EloRatings, getEloRatings } from "@/lib/elo-service";
import { baselineCompetition, type HomeBaseline } from "@/lib/home-baseline";
import { teamDisplayName } from "@/lib/match-detail";
import { getHomeBaseline, type StoredMatch } from "@/lib/match-service";
import { formatSeasonLabel } from "@/lib/seasons";

/** The strings agreed in specs/051, each where the spec places it. */
export const PREDICTION_HEADING = "Ennuste";
export const PREDICTION_ERROR_MESSAGE = "Ennustetta ei voitu laskea. Yritä myöhemmin uudelleen.";
export const NO_HISTORY_MESSAGE = "Kilpailusta ei ole vielä tallennettuja otteluita.";
export const PREDICTION_SIGNED_OUT_MESSAGE = "Kirjaudu sisään nähdäksesi ennusteen.";
/** specs/053 S13. */
export const BASELINE_ROW = "Perustaso";
export const ELO_ROW = "Elo";

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

/**
 * The Elo line (specs/053 S13): both teams' ratings, rounded, then how the
 * prediction is made from them.
 */
export function eloSentence(
  homeName: string,
  homeRating: number,
  awayName: string,
  awayRating: number
): string {
  return `Elo: ${homeName} ${Math.round(homeRating)}, ${awayName} ${Math.round(awayRating)}. Kotijoukkueelle lisätään ${ELO_HOME_ADVANTAGE} pistettä, ja tasapelin todennäköisyys on kilpailun tasapelien osuus.`;
}

/** One model's row: its name and three shares, 0–100. */
type PredictionRow = { model: string; home: number; draw: number; away: number };

const COLUMNS: ReadonlyArray<DataTableColumn<PredictionRow>> = [
  { key: "model", header: "", width: "flex", render: (row) => row.model, rowHeader: true },
  {
    key: "home",
    header: "Kotivoitto",
    width: 104,
    align: "right",
    render: (row) => percentText(row.home),
  },
  {
    key: "draw",
    header: "Tasapeli",
    width: 96,
    align: "right",
    render: (row) => percentText(row.draw),
  },
  {
    key: "away",
    header: "Vierasvoitto",
    width: 112,
    align: "right",
    render: (row) => percentText(row.away),
  },
];

/** The two teams as the panel names them, and their ids. */
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
  // No Elo row for a placeholder side; the baseline still stands (S16 needs
  // the baseline's draw share, which this branch has).
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
      <DataTable columns={COLUMNS} rowKey={(row) => row.model} rows={rows} />
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
    </div>
  );
}

/**
 * The match page's `Ennuste` (specs/051): the competition's home-win baseline
 * and, beside it, the Elo prediction from the two teams' ratings (specs/053
 * S8), on an upcoming match in a competition specs/049 compares, or nothing.
 *
 * The analytics gate is asked before anything is read, so a signed-out page
 * carries no probability (S4). Awaited by the page rather than rendered, as
 * `CompetitionAnalyticsSection` is.
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
