import type { FormPoint } from "@/lib/form-series";
import { formatDecimal, LineChart, ticksFor } from "./line-chart";

/**
 * About this many labelled matches on the x-axis: enough to read a value, few
 * enough to fit.
 *
 * decisions/031-rolling-form-trend.md
 */
const TICK_COUNT = 7;

/**
 * Points per match runs from none to a win every time.
 *
 * decisions/031-rolling-form-trend.md
 */
const MAX_FORM = 3;

/**
 * One row of the text alternative, per match.
 *
 * decisions/031-rolling-form-trend.md
 */
export function formSentence(point: FormPoint): string {
  return `Vire ${point.match}. ottelun jälkeen: ${formatDecimal(point.form)} pistettä ottelua kohden.`;
}

/**
 * A team's form after each of its matches: points per match over the last
 * five, 3 at the top and 0 at the bottom. Every point is also text, which the
 * chart points at with `aria-describedby`.
 *
 * decisions/031-rolling-form-trend.md
 */
export function FormChart({
  title,
  points,
  headingId,
}: Readonly<{ title: string; points: readonly FormPoint[]; headingId: string }>) {
  const textId = `${headingId}-text`;
  const firstMatch = points[0]?.match ?? 1;
  const lastMatch = points.at(-1)?.match ?? firstMatch;

  return (
    <div>
      <LineChart
        describedBy={textId}
        labelledBy={headingId}
        series={[
          { name: "form", points: points.map((point) => ({ x: point.match, y: point.form })) },
        ]}
        title={title}
        xDomain={[firstMatch, lastMatch]}
        xLabel="Ottelu"
        xTicks={ticksFor(firstMatch, lastMatch, TICK_COUNT)}
        yDomain={[0, MAX_FORM]}
        yLabel="Pisteitä / ottelu"
        yTicks={ticksFor(0, MAX_FORM, MAX_FORM + 1)}
      />
      <ol className="sr-only" id={textId}>
        {points.map((point) => (
          <li key={point.match}>{formSentence(point)}</li>
        ))}
      </ol>
    </div>
  );
}
