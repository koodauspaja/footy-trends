import { ChartPanel } from "@/components/charts/chart-panel";
import { LineChart } from "@/components/charts/line-chart";
import type { TeamEloSeries } from "@/lib/elo-service";

/**
 * The panel's strings.
 *
 * decisions/053-elo-ratings.md
 */
export const ELO_HEADING = "Joukkueen vahvuus (Elo)";
export const ELO_NOTE =
  "1500 on keskitasoinen joukkue. Luku nousee voitoista ja laskee tappioista sitä enemmän, mitä vahvempaa vastustajaa vastaan ottelu pelattiin.";
/**
 * Wherever Elo was needed and the replay failed: this panel, and `Ennuste`.
 *
 * decisions/053-elo-ratings.md
 */
export const ELO_ERROR_MESSAGE = "Vahvuutta ei voitu laskea. Yritä myöhemmin uudelleen.";
export const ELO_EMPTY_MESSAGE = "Joukkueella ei ole tallennettuja otteluita näistä kilpailuista.";
const Y_LABEL = "Elo-luku";

const HEADING_ID = "team-elo";

/**
 * `unavailable` on a national team's page: no Elo there.
 *
 * decisions/053-elo-ratings.md
 */
export type EloPanelData =
  | { series: TeamEloSeries; seasonLabel: (seasonId: number) => string }
  | { series: { status: "unavailable" } };

/**
 * One season's line in the text alternative: its last rating.
 *
 * decisions/053-elo-ratings.md
 */
export function eloSeasonSentence(seasonLabel: string, rating: number): string {
  return `${seasonLabel}: ${Math.round(rating)}`;
}

/**
 * The y axis: whole fifties around the ratings, ticked every 50 — or every
 * 100 once the span passes 300, so a phone's axis stays legible.
 *
 * decisions/053-elo-ratings.md
 */
export function eloAxis(ratings: readonly number[]): { domain: [number, number]; ticks: number[] } {
  const low = Math.floor((Math.min(...ratings) - 10) / 50) * 50;
  const high = Math.ceil((Math.max(...ratings) + 10) / 50) * 50;
  const step = high - low > 300 ? 100 : 50;
  const ticks: number[] = [];
  for (let tick = Math.ceil(low / step) * step; tick <= high; tick += step) ticks.push(tick);
  return { domain: [low, high], ticks };
}

/**
 * The team page's `Joukkueen vahvuus (Elo)`, or `null` where
 * there is none. A plain function, as the other panels, so the section can
 * tell an absent panel from a present one.
 *
 * decisions/053-elo-ratings.md
 */
export function eloPanel(data: EloPanelData) {
  if (!("seasonLabel" in data)) return null;
  return (
    <ChartPanel heading={ELO_HEADING} headingId={HEADING_ID}>
      <Body seasonLabel={data.seasonLabel} series={data.series} />
    </ChartPanel>
  );
}

function Body({
  series,
  seasonLabel,
}: Readonly<{ series: TeamEloSeries; seasonLabel: (seasonId: number) => string }>) {
  if (series.status === "error") return <p>{ELO_ERROR_MESSAGE}</p>;
  if (series.status === "empty") return <p>{ELO_EMPTY_MESSAGE}</p>;

  const textId = `${HEADING_ID}-text`;
  // x is the season, each match spread evenly across its own: a season's
  // first match sits on its tick, and a gap in a club's covered seasons shows.
  const bySeason = new Map<number, number[]>();
  const lastRating = new Map<number, number>();
  for (const point of series.points) {
    const ratings = bySeason.get(point.seasonId);
    if (ratings === undefined) bySeason.set(point.seasonId, [point.rating]);
    else ratings.push(point.rating);
    lastRating.set(point.seasonId, point.rating);
  }
  const seasons = [...bySeason.keys()];
  const points = [...bySeason].flatMap(([seasonId, ratings]) =>
    ratings.map((rating, index) => ({ x: seasonId + index / ratings.length, y: rating }))
  );
  const axis = eloAxis(series.points.map((point) => point.rating));

  return (
    <div>
      <LineChart
        describedBy={textId}
        formatXTick={seasonLabel}
        formatYTick={String}
        labelledBy={HEADING_ID}
        series={[
          {
            name: "elo",
            dots: false,
            points,
          },
        ]}
        thinXTicksOnPhone
        title={ELO_HEADING}
        xDomain={[Math.min(...seasons), Math.max(...seasons) + 1]}
        xLabel="Kausi"
        xTicks={seasons}
        yDomain={axis.domain}
        yLabel={Y_LABEL}
        yTicks={axis.ticks}
      />
      <ol className="sr-only" id={textId}>
        {[...lastRating].map(([seasonId, rating]) => (
          <li key={seasonId}>{eloSeasonSentence(seasonLabel(seasonId), rating)}</li>
        ))}
      </ol>
      <p className="mt-2 text-muted text-sm">{ELO_NOTE}</p>
    </div>
  );
}
