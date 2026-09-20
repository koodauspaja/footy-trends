import type { CleanSheetPoint } from "@/lib/clean-sheets";
import { LineChart, percentText, ticksFor } from "./line-chart";

/** About this many labelled matches on the x-axis, as the other per-match charts. */
const TICK_COUNT = 7;

/** A share runs the whole way: seasons are comparable because the axis never moves. */
const MAX_SHARE = 100;

/** One row of the text alternative, per match (specs/034, Q3). */
export function cleanSheetSentence(point: CleanSheetPoint): string {
  return `Nollapelien osuus ${point.match}. ottelun jälkeen: ${percentText(point.share)} (${point.kept}/${point.match}).`;
}

/**
 * The running share of matches with nothing conceded, after each of the team's
 * matches: 0 % at the bottom, 100 % at the top, from the first match.
 *
 * **Every point is also text**, as on the other charts, and it carries the count
 * as well as the share — `25 % (3/12)` says what the percentage is of.
 */
export function CleanSheetChart({
  title,
  points,
  headingId,
}: Readonly<{ title: string; points: readonly CleanSheetPoint[]; headingId: string }>) {
  const textId = `${headingId}-text`;
  const firstMatch = points[0]?.match ?? 1;
  const lastMatch = points.at(-1)?.match ?? firstMatch;

  return (
    <div>
      <LineChart
        describedBy={textId}
        labelledBy={headingId}
        series={[
          {
            name: "clean-sheets",
            points: points.map((point) => ({ x: point.match, y: point.share })),
          },
        ]}
        title={title}
        xDomain={[firstMatch, lastMatch]}
        xLabel="Ottelu"
        xTicks={ticksFor(firstMatch, lastMatch, TICK_COUNT)}
        yDomain={[0, MAX_SHARE]}
        yLabel="Nollapelien osuus"
        yTicks={ticksFor(0, MAX_SHARE, 5)}
      />
      <ol className="sr-only" id={textId}>
        {points.map((point) => (
          <li key={point.match}>{cleanSheetSentence(point)}</li>
        ))}
      </ol>
    </div>
  );
}
