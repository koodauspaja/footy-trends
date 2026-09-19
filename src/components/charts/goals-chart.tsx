import type { GoalsPoint } from "@/lib/goals-series";
import { formatDecimal, LineChart, LineLegend, ticksFor } from "./line-chart";

/** About this many labelled matches on the x-axis, as the form chart. */
const TICK_COUNT = 7;

/**
 * The rolling chart's y-axis top: one value for every league and season
 * (specs/032, Q3). Measured over 118 top-tier team-seasons, no five-match
 * average passed 4.4; averaging 5 takes 25 goals in five matches.
 */
export const ROLLING_TOP = 5;

/** The legend, the standings table's own titles for `TM` and `PM`. */
export const SCORED_LABEL = "Tehdyt maalit";
export const CONCEDED_LABEL = "Päästetyt maalit";

/** One row of the rolling chart's text alternative (specs/032, Q4). */
export function rollingSentence(point: GoalsPoint): string {
  return `Maalit ${point.match}. ottelun jälkeen: tehdyt ${formatDecimal(point.scored)}, päästetyt ${formatDecimal(point.conceded)} ottelua kohden.`;
}

/** One row of the running-total chart's text alternative (specs/032, Q1). */
export function totalsSentence(point: GoalsPoint): string {
  return `Maalit yhteensä ${point.match}. ottelun jälkeen: tehdyt ${point.scored}, päästetyt ${point.conceded}.`;
}

/**
 * The running totals' y-axis top: the team's highest total, rounded up to a
 * whole ten, and never below ten. One fixed value cannot serve a Bundesliga
 * attack with 99 goals and a Veikkausliiga side with 30 (specs/032, Q1).
 */
export function totalsTop(points: readonly GoalsPoint[]): number {
  const highest = Math.max(0, ...points.flatMap((point) => [point.scored, point.conceded]));
  return Math.max(10, Math.ceil(highest / 10) * 10);
}

/**
 * A tick on every whole ten up to `top`, which is itself a ten. The most goals
 * in the stored top-tier seasons was 99 — an axis to 100, eleven labels, which
 * the chart's height holds.
 */
export function totalsTicks(top: number): number[] {
  return Array.from({ length: top / 10 + 1 }, (_, index) => index * 10);
}

/**
 * Goals scored and conceded after each of the team's matches: scored a solid
 * line, conceded a dashed one, both in the foreground colour, with a legend
 * beneath — told apart by shape, not colour (specs/032, Q5).
 *
 * A value above `yTop` is drawn at the top edge; its text row still states the
 * true value (specs/032, Q3a). Only the rolling chart has a fixed top to meet.
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
          { points: line((point) => point.scored) },
          { points: line((point) => point.conceded), dashed: true },
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
