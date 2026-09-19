import type { FormPoint } from "@/lib/form-series";
import { LineChart, ticksFor } from "./line-chart";

/** About this many labelled matches on the x-axis — enough to read a value, few enough to fit. */
const TICK_COUNT = 7;

/** Points per match runs from none to a win every time. */
const MAX_FORM = 3;

/** `2.2` → `2,2`: one decimal is exact, since form over five matches moves in fifths. */
export function formatForm(form: number): string {
  return form.toFixed(1).replace(".", ",");
}

/** One row of the text alternative, per match (specs/031, Q3). */
export function formSentence(point: FormPoint): string {
  return `Vire ${point.match}. ottelun jälkeen: ${formatForm(point.form)} pistettä ottelua kohden.`;
}

/**
 * A team's form after each of its matches: points per match over the last
 * five, 3 at the top and 0 at the bottom — more points is higher, the other way
 * up from the position chart beside it.
 *
 * **Every point is also text**, as on the position chart: a list for a screen
 * reader, which the chart points at with `aria-describedby`.
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
        points={points.map((point) => ({ x: point.match, y: point.form }))}
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
