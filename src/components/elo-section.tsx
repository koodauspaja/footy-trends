import { ChartPanel } from "@/components/charts/chart-panel";
import { LineChart } from "@/components/charts/line-chart";
import type { TeamEloSeries } from "@/lib/elo-service";

/** The strings agreed in specs/053 (S9, S10, S13), each where the spec places it. */
export const ELO_HEADING = "Joukkueen vahvuus (Elo)";
export const ELO_NOTE =
  "1500 on keskitasoinen joukkue. Luku nousee voitoista ja laskee tappioista sitä enemmän, mitä vahvempaa vastustajaa vastaan ottelu pelattiin.";
/** Wherever Elo was needed and the replay failed: this panel, and `Ennuste`. */
export const ELO_ERROR_MESSAGE = "Vahvuutta ei voitu laskea. Yritä myöhemmin uudelleen.";
export const ELO_EMPTY_MESSAGE = "Joukkueella ei ole tallennettuja otteluita näistä kilpailuista.";
const Y_LABEL = "Elo-luku";

const HEADING_ID = "team-elo";

/** `unavailable` on a national team's page: no Elo there (specs/053 S5). */
export type EloPanelData =
  | { series: TeamEloSeries; seasonLabel: (seasonId: number) => string }
  | { series: { status: "unavailable" } };

/** One season's line in the text alternative: its last rating. */
export function eloSeasonSentence(seasonLabel: string, rating: number): string {
  return `${seasonLabel}: ${Math.round(rating)}`;
}

/**
 * The y axis: whole fifties around the ratings, ticked every 50 — or every
 * 100 once the span passes 300, so a phone's axis stays legible.
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
 * The team page's `Joukkueen vahvuus (Elo)` (specs/053 S9), or `null` where
 * there is none. A plain function, as the other panels, so the section can
 * tell an absent panel from a present one.
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
  // x is the match's place in the team's history; a season's first match ticks it.
  const points = series.points.map((point, index) => ({ ...point, x: index + 1 }));
  const seasonStarts = new Map<number, number>();
  const seasonEnds = new Map<number, number>();
  for (const point of points) {
    if (!seasonStarts.has(point.seasonId)) seasonStarts.set(point.seasonId, point.x);
    seasonEnds.set(point.seasonId, point.rating);
  }
  const startsAt = new Map([...seasonStarts].map(([seasonId, x]) => [x, seasonId]));
  const axis = eloAxis(points.map((point) => point.rating));

  return (
    <div>
      <LineChart
        describedBy={textId}
        formatXTick={(tick) => seasonLabel(startsAt.get(tick) ?? 0)}
        formatYTick={String}
        labelledBy={HEADING_ID}
        series={[
          {
            name: "elo",
            dots: false,
            points: points.map((point) => ({ x: point.x, y: point.rating })),
          },
        ]}
        thinXTicksOnPhone
        title={ELO_HEADING}
        xDomain={[1, Math.max(2, points.length)]}
        xLabel="Kausi"
        xTicks={[...seasonStarts.values()]}
        yDomain={axis.domain}
        yLabel={Y_LABEL}
        yTicks={axis.ticks}
      />
      <ol className="sr-only" id={textId}>
        {[...seasonEnds].map(([seasonId, rating]) => (
          <li key={seasonId}>{eloSeasonSentence(seasonLabel(seasonId), rating)}</li>
        ))}
      </ol>
      <p className="mt-2 text-muted text-sm">{ELO_NOTE}</p>
    </div>
  );
}
