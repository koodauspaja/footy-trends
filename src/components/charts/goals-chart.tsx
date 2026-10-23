import type { GoalsPoint } from "@/lib/goals-series";
import { formatDecimal, LineChart, LineLegend, ticksFor } from "./line-chart";

/**
 * About this many labelled matches on the x-axis, as the form chart.
 *
 * decisions/032-goals-scored-vs-conceded.md
 */
const TICK_COUNT = 7;

/**
 * The rolling chart's y-axis top: one value for every league and season.
 *
 * decisions/032-goals-scored-vs-conceded.md
 */
export const ROLLING_TOP = 5;

/**
 * The legend, the standings table's own titles for `TM` and `PM`.
 *
 * decisions/032-goals-scored-vs-conceded.md
 */
export const SCORED_LABEL = "Tehdyt maalit";
export const CONCEDED_LABEL = "Päästetyt maalit";

/**
 * One row of the rolling chart's text alternative.
 *
 * decisions/032-goals-scored-vs-conceded.md
 */
export function rollingSentence(point: GoalsPoint): string {
  return `Maalit ${point.match}. ottelun jälkeen: tehdyt ${formatDecimal(point.scored)}, päästetyt ${formatDecimal(point.conceded)} ottelua kohden.`;
}

/**
 * One row of the running-total chart's text alternative.
 *
 * decisions/032-goals-scored-vs-conceded.md
 */
export function totalsSentence(point: GoalsPoint): string {
  return `Maalit yhteensä ${point.match}. ottelun jälkeen: tehdyt ${point.scored}, päästetyt ${point.conceded}.`;
}

/**
 * The running totals' y-axis top: the team's highest total, rounded up to a
 * whole `totalsStep`, and never below one. One fixed value cannot serve a
 * Bundesliga attack with 99 goals and a Veikkausliiga side with 30.
 *
 * decisions/032-goals-scored-vs-conceded.md
 * decisions/700-legible-charts.md
 */
export function totalsTop(points: readonly GoalsPoint[]): number {
  const highest = Math.max(0, ...points.flatMap((point) => [point.scored, point.conceded]));
  const step = totalsStep(highest);
  return Math.max(step, Math.ceil(highest / step) * step);
}

/**
 * The step between the totals' ticks: the smallest of 10, 20, 25, 50, 100, 200
 * and so on that reaches `highest` in six steps, so the axis prints seven labels
 * at most and each stays legible on a phone.
 *
 * decisions/700-legible-charts.md
 */
export function totalsStep(highest: number): number {
  const rough = Math.max(10, highest / 6);
  const power = 10 ** Math.floor(Math.log10(rough));
  for (const multiple of [1, 2, 2.5, 5]) {
    if (multiple * power >= rough) return multiple * power;
  }
  return 10 * power;
}

/**
 * A tick on every step up to `top`, which `totalsTop` made a whole step.
 *
 * decisions/032-goals-scored-vs-conceded.md
 * decisions/700-legible-charts.md
 */
export function totalsTicks(top: number): number[] {
  const step = totalsStep(top);
  return Array.from({ length: top / step + 1 }, (_, index) => index * step);
}

/**
 * Goals scored and conceded after each of the team's matches: scored a solid
 * line, conceded a dashed one, told apart by shape, not colour. A value above
 * `yTop` is drawn at the top edge; its text row states the true value.
 *
 * decisions/032-goals-scored-vs-conceded.md
 */
export function GoalsChart({
  title,
  points,
  headingId,
  yTop,
  yTicks,
  yLabel,
  sentence,
}: Readonly<{
  title: string;
  points: readonly GoalsPoint[];
  headingId: string;
  yTop: number;
  yTicks: readonly number[];
  yLabel: string;
  sentence: (point: GoalsPoint) => string;
}>) {
  const textId = `${headingId}-text`;
  const firstMatch = points[0]?.match ?? 1;
  const lastMatch = points.at(-1)?.match ?? firstMatch;
  const line = (value: (point: GoalsPoint) => number) =>
    points.map((point) => ({ x: point.match, y: Math.min(value(point), yTop) }));

  return (
    <div>
      <LineChart
        describedBy={textId}
        labelledBy={headingId}
        series={[
          { name: "scored", points: line((point) => point.scored) },
          { name: "conceded", points: line((point) => point.conceded), dashed: true },
        ]}
        title={title}
        xDomain={[firstMatch, lastMatch]}
        xLabel="Ottelu"
        xTicks={ticksFor(firstMatch, lastMatch, TICK_COUNT)}
        yDomain={[0, yTop]}
        yLabel={yLabel}
        yTicks={yTicks}
      />
      <LineLegend items={[{ label: SCORED_LABEL }, { label: CONCEDED_LABEL, dashed: true }]} />
      <ol className="sr-only" id={textId}>
        {points.map((point) => (
          <li key={point.match}>{sentence(point)}</li>
        ))}
      </ol>
    </div>
  );
}
