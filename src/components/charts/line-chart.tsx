/**
 * The app's line chart: one or more lines on two axes, drawn as SVG on the
 * server (specs/030, *Chart foundation*). A second line arrived with specs/032,
 * told apart by its dash rather than a colour, with `LineLegend` to name it.
 *
 * **Hand-rolled rather than a library**, chosen in chat on 2026-09-18: SVG
 * renders on the server with no client JavaScript, and a test can assert what
 * is drawn — the points, the scales, the direction — which a canvas would not
 * allow under this repository's coverage and mutation rules. Nothing here
 * anticipates a chart that does not exist yet.
 *
 * The geometry is in the exported functions below, so it is tested directly
 * rather than through the markup.
 */

export type ChartPoint = {
  x: number;
  y: number;
  /**
   * Drawn as an open circle rather than a filled dot: a value that is on the
   * line but that the series' subject did not produce itself — for the
   * position chart, a round the team sat out (#413).
   */
  open?: boolean;
};

/**
 * `2.2` → `2,2`: a Finnish decimal comma, one decimal by default. One is exact
 * for averages over five matches, which move in fifths; a season's average
 * takes two (`2,11`, specs/033). `toFixed` also hides floating point
 * (`0.2 × 3` is `0.6000000000000001`).
 */
export function formatDecimal(value: number, digits = 1): string {
  return value.toFixed(digits).replace(".", ",");
}

/**
 * `63 %`: a whole percent, a no-break space before the sign as Finnish writes
 * it, so the number and its sign never wrap apart (specs/033, Q5).
 */
export function percentText(value: number): string {
  return `${Math.round(value)}\u00a0%`;
}

/** The drawing area, in SVG user units; `viewBox` scales it to the page. */
export const CHART = { width: 640, height: 320 } as const;
/**
 * The gutters around the plot, in SVG user units.
 *
 * `bottom` and `left` carry the axis labels, which are larger below `sm` (see
 * `AXIS_TEXT`): 56 keeps the x-tick row clear of the axis caption, and 72 fits
 * a three-digit y tick — the clean-sheet share axis runs to 100 — beside the
 * rotated caption without crowding it. `MARGIN` is JavaScript, so it cannot answer the
 * breakpoint the way the font does; both gutters are therefore sized for the
 * larger text and cost a few units of plot at every width.
 */
export const MARGIN = { top: 16, right: 16, bottom: 56, left: 72 } as const;

/**
 * The axis font, which scales with the drawing because the text is inside the
 * `viewBox` — `text-xs` is 12 *user units*, not 12 screen pixels, and SVG has
 * no non-scaling equivalent for text.
 *
 * At 640 units shown on a 375-px phone the drawing is about 0,54x, so today's
 * 12 units reached the reader at roughly 6 px. Enlarging the font below `sm`
 * fixes that without narrowing the drawing, which would have cost the desktop
 * canvas (#441).
 */
const AXIS_TEXT = "text-[19px] sm:text-xs";

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

/**
 * One line on a chart. A second series is told apart by its dash, not by a
 * colour: every line is the theme's foreground, so it reads in both themes and
 * without colour vision (specs/032, Q5).
 */
export type LineSeries = {
  /** What the line is, unique within its chart: its key, and `data-series`. */
  name: string;
  points: readonly ChartPoint[];
  dashed?: boolean;
};

/** The dash pattern of a dashed series, shared with its legend sample. */
const DASH = "6 4";

type LineChartProps = {
  /** The chart's own name, in a `<title>`: it travels with the SVG wherever it is shown. */
  title: string;
  /** Drawn in order, so a later series lies over an earlier one where they meet. */
  series: readonly LineSeries[];
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
  series,
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

      <g className={`fill-muted ${AXIS_TEXT}`} data-part="y-axis">
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

      <g className={`fill-muted ${AXIS_TEXT}`} data-part="x-axis">
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

      {series.map((line) => (
        <g
          data-dashed={line.dashed ? "" : undefined}
          data-part="series"
          data-series={line.name}
          key={line.name}
        >
          <polyline
            className="fill-none stroke-foreground"
            data-part="line"
            points={line.points.map((point) => `${toX(point.x)},${toY(point.y)}`).join(" ")}
            strokeDasharray={line.dashed ? DASH : undefined}
            strokeLinejoin="round"
            strokeWidth={2}
          />
          <g data-part="points">
            {line.points.map((point) =>
              point.open ? (
                // Filled with the page's background, so the line does not show
                // through the ring.
                <circle
                  className="fill-background stroke-foreground"
                  cx={toX(point.x)}
                  cy={toY(point.y)}
                  data-open=""
                  key={point.x}
                  r={3}
                  strokeWidth={1.5}
                />
              ) : (
                <circle
                  className="fill-foreground"
                  cx={toX(point.x)}
                  cy={toY(point.y)}
                  key={point.x}
                  r={3}
                />
              )
            )}
          </g>
        </g>
      ))}
    </svg>
  );
}

/**
 * Which line is which, beneath a chart with more than one: a short sample of
 * each line's style beside its label, so a dash is never a riddle.
 */
export function LineLegend({
  items,
}: Readonly<{ items: ReadonlyArray<{ label: string; dashed?: boolean }> }>) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-muted text-sm">
      {items.map((item) => (
        <li className="flex items-center gap-2" key={item.label}>
          <svg aria-hidden="true" className="h-2 w-6" viewBox="0 0 24 8">
            <line
              className="stroke-foreground"
              strokeDasharray={item.dashed ? DASH : undefined}
              strokeWidth={2}
              x1={0}
              x2={24}
              y1={4}
              y2={4}
            />
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
