import type { PositionPoint } from "@/lib/position-series";
import { LineChart, ticksFor } from "./line-chart";

/**
 * About this many labelled ticks per axis — enough to read a value, few enough to fit.
 *
 * decisions/030-league-position-by-matchday.md
 */
const TICK_COUNT = 7;

/**
 * Beneath the chart when any point is open, so an open circle is not a riddle.
 *
 * decisions/413-rounds-a-team-sat-out.md
 */
export const OPEN_POINT_LEGEND = "Avoin pallo: joukkue ei pelannut kierroksella.";

/**
 * One row of the text alternative, per round. A round the team sat out says
 * so, as the open circle does on the chart.
 *
 * decisions/030-league-position-by-matchday.md
 * decisions/413-rounds-a-team-sat-out.md
 */
export function positionSentence(point: PositionPoint): string {
  const base = `Sijoitus ${point.round}. kierroksen jälkeen: ${point.position}`;
  return point.played ? `${base}.` : `${base} (ei omaa ottelua).`;
}

/**
 * A team's league position after each round: first place at the top, the whole
 * league on the axis, also after a split. Every point is also text, which the
 * chart points at with `aria-describedby`.
 *
 * decisions/030-league-position-by-matchday.md
 */
export function PositionChart({
  title,
  points,
  teamCount,
  headingId,
}: Readonly<{
  title: string;
  points: readonly PositionPoint[];
  teamCount: number;
  headingId: string;
}>) {
  const textId = `${headingId}-text`;
  const firstRound = points[0]?.round ?? 1;
  const lastRound = points.at(-1)?.round ?? firstRound;

  return (
    <div>
      <LineChart
        describedBy={textId}
        invertY
        labelledBy={headingId}
        series={[
          {
            name: "position",
            points: points.map((point) => ({
              x: point.round,
              y: point.position,
              open: !point.played,
            })),
          },
        ]}
        title={title}
        xDomain={[firstRound, lastRound]}
        xLabel="Kierros"
        xTicks={ticksFor(firstRound, lastRound, TICK_COUNT)}
        yDomain={[1, teamCount]}
        yLabel="Sijoitus"
        yTicks={ticksFor(1, teamCount, TICK_COUNT)}
      />
      {points.some((point) => !point.played) ? (
        <p className="mt-2 text-muted text-sm">{OPEN_POINT_LEGEND}</p>
      ) : null}
      <ol className="sr-only" id={textId}>
        {points.map((point) => (
          <li key={point.round}>{positionSentence(point)}</li>
        ))}
      </ol>
    </div>
  );
}
