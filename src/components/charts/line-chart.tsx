/**
 * The app's first chart: one line, two axes, drawn as SVG on the server
 * (specs/030, *Chart foundation*).
 *
 * **Hand-rolled rather than a library**, chosen in chat on 2026-09-18: SVG
 * renders on the server with no client JavaScript, and a test can assert what
 * is drawn — the points, the scales, the direction — which a canvas would not
 * allow under this repository's coverage and mutation rules. #327–#329 build on
 * it; nothing here anticipates them beyond a line and its axes.
 *
 * The geometry is in the exported functions below, so it is tested directly
 * rather than through the markup.
 */

export type ChartPoint = { x: number; y: number };

/** The drawing area, in SVG user units; `viewBox` scales it to the page. */
export const CHART = { width: 640, height: 320 } as const;
export const MARGIN = { top: 16, right: 16, bottom: 44, left: 48 } as const;

/**
 * `value` mapped from `domain` onto `range`, linearly.
 *
 * A domain of one value — a season with a single round played, a league of one
 * team — puts everything in the middle of the range rather than dividing by
 * zero.
 */
export function scale(
  value: number,
  [domainMin, domainMax]: readonly [number, number],
  [rangeStart, rangeEnd]: readonly [number, number]
): number {
  if (domainMax === domainMin) return (rangeStart + rangeEnd) / 2;
  return rangeStart + ((value - domainMin) / (domainMax - domainMin)) * (rangeEnd - rangeStart);
}

/**
 * Round-number ticks from `min` to `max`, both ends included, about `count` of
 * them.
 *
 * **Both ends are always ticks**, so an axis always labels where it starts and
 * ends: a `count` below 2 is treated as 2 rather than dropping one of them.
 *
 * The step is a whole number, because both axes here count things — rounds and
 * places. The last regular tick is dropped when it would crowd `max`, so the
 * axis never prints 37 and 38 side by side.
 */
export function ticksFor(min: number, max: number, count: number): number[] {
  if (max <= min) return [min];

  const step = Math.max(1, Math.ceil((max - min) / Math.max(1, count - 1)));
  const ticks: number[] = [];
  for (let tick = min; tick < max; tick += step) ticks.push(tick);

  const last = ticks.at(-1);
  if (last !== undefined && last !== min && max - last < step / 2) ticks.pop();

  return [...ticks, max];
}

type LineChartProps = {
  /** The chart's own name, in a `<title>`: it travels with the SVG wherever it is shown. */
  title: string;
  points: readonly ChartPoint[];
  xDomain: readonly [number, number];
  yDomain: readonly [number, number];
  /** Draws the smallest `y` at the top, as a table puts first place. */
  invertY?: boolean;
  xTicks: readonly number[];
  yTicks: readonly number[];
  xLabel: string;
  yLabel: string;
  /** The element that names the chart — its heading. */
  labelledBy: string;
  /** The element that lists its values as text. */
  describedBy: string;
};

export function LineChart({
  title,
  points,
  xDomain,
  yDomain,
  invertY = false,
  xTicks,
  yTicks,
  xLabel,
  yLabel,
  labelledBy,
  describedBy,
}: Readonly<LineChartProps>) {
  const left = MARGIN.left;
  const right = CHART.width - MARGIN.right;
  const top = MARGIN.top;
  const bottom = CHART.height - MARGIN.bottom;
  const yRange: [number, number] = invertY ? [top, bottom] : [bottom, top];

  const toX = (value: number) => scale(value, xDomain, [left, right]);
  const toY = (value: number) => scale(value, yDomain, yRange);

  return (
    <svg
      aria-describedby={describedBy}
      aria-labelledby={labelledBy}
      className="h-auto w-full max-w-2xl"
      role="img"
      viewBox={`0 0 ${CHART.width} ${CHART.height}`}
    >
      <title>{title}</title>
      <g className="stroke-border-subtle" data-part="grid">
        {yTicks.map((tick) => (
          <line key={tick} x1={left} x2={right} y1={toY(tick)} y2={toY(tick)} />
        ))}
      </g>

      <g className="fill-muted text-xs" data-part="y-axis">
        {yTicks.map((tick) => (
          <text dominantBaseline="middle" key={tick} textAnchor="end" x={left - 8} y={toY(tick)}>
            {tick}
          </text>
        ))}
        <text
          textAnchor="middle"
          transform={`translate(12 ${(top + bottom) / 2}) rotate(-90)`}
          x={0}
          y={0}
        >
          {yLabel}
        </text>
      </g>

      <g className="fill-muted text-xs" data-part="x-axis">
        <line className="stroke-border" x1={left} x2={right} y1={bottom} y2={bottom} />
        {xTicks.map((tick) => (
          <text key={tick} textAnchor="middle" x={toX(tick)} y={bottom + 18}>
            {tick}
          </text>
        ))}
        <text textAnchor="middle" x={(left + right) / 2} y={CHART.height - 6}>
          {xLabel}
        </text>
      </g>

      <polyline
        className="fill-none stroke-foreground"
        data-part="line"
        points={points.map((point) => `${toX(point.x)},${toY(point.y)}`).join(" ")}
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <g className="fill-foreground" data-part="points">
        {points.map((point) => (
          <circle cx={toX(point.x)} cy={toY(point.y)} key={point.x} r={3} />
        ))}
      </g>
    </svg>
  );
}
