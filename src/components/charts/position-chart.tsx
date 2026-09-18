import type { PositionPoint } from "@/lib/position-series";
import { LineChart, ticksFor } from "./line-chart";

/** About this many labelled ticks per axis — enough to read a value, few enough to fit. */
const TICK_COUNT = 7;

/** One row of the text alternative, per round (specs/030, Q6). */
export function positionSentence(point: PositionPoint): string {
  return `Sijoitus ${point.round}. kierroksen jälkeen: ${point.position}.`;
}

/**
 * A team's league position after each round: first place at the top, the whole
 * league on the axis — also after a split — so a season reads the same way as
 * the table beside it, and two seasons of one league share a scale.
 *
 * **Every point is also text.** The list below the chart holds each round and
 * position, for a screen reader and for anyone who cannot read the line; the
 * chart points at it with `aria-describedby`.
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
  const textId = `${headingId}-teksti`;
  const firstRound = points[0]?.round ?? 1;
  const lastRound = points.at(-1)?.round ?? firstRound;

  return (
    <div>
      <LineChart
        describedBy={textId}
        invertY
        labelledBy={headingId}
        points={points.map((point) => ({ x: point.round, y: point.position }))}
        title={title}
        xDomain={[firstRound, lastRound]}
        xLabel="Kierros"
        xTicks={ticksFor(firstRound, lastRound, TICK_COUNT)}
        yDomain={[1, teamCount]}
        yLabel="Sijoitus"
        yTicks={ticksFor(1, teamCount, TICK_COUNT)}
      />
      <ol className="sr-only" id={textId}>
        {points.map((point) => (
          <li key={point.round}>{positionSentence(point)}</li>
        ))}
      </ol>
    </div>
  );
}
