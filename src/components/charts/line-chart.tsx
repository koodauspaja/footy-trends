/**
 * The app's line chart: one or more lines on two axes, drawn as SVG on the
 * server. The geometry is in the exported functions, so it is tested directly.
 *
 * decisions/030-league-position-by-matchday.md
 * decisions/032-goals-scored-vs-conceded.md
 * decisions/033-home-vs-away.md
 * decisions/048-league-goals-per-game-trend.md
 * decisions/050-table-volatility.md
 * decisions/053-elo-ratings.md
 * decisions/054-prediction-quality.md
 * decisions/413-rounds-a-team-sat-out.md
 */

export type ChartPoint = {
  x: number;
  y: number;
  /**
   * Drawn as an open circle: a value on the line that the series' subject did
   * not produce itself.
   */
  open?: boolean;
  /**
   * Ringed, to pick one point out of the line.
   */
  marked?: boolean;
};

/**
 * `2.2` becomes `2,2`: a Finnish decimal comma, one decimal by default.
 *
 * decisions/032-goals-scored-vs-conceded.md
 * decisions/033-home-vs-away.md
 */
export function formatDecimal(value: number, digits = 1): string {
  return value.toFixed(digits).replace(".", ",");
}

/**
 * `63 %`: a whole percent, with a no-break space before the sign so the two
 * never wrap apart.
 *
 * decisions/033-home-vs-away.md
 * decisions/034-clean-sheets.md
 */
export function percentText(value: number): string {
  return `${Math.round(value)}\u00a0%`;
}

/**
 * The drawing area, in SVG user units; `viewBox` scales it to the page.
 *
 * decisions/030-league-position-by-matchday.md
 */
export const CHART = { width: 640, height: 320 } as const;
/**
 * The gutters around the plot, in SVG user units, sized for the axis text a
 * phone gets.
 *
 * decisions/030-league-position-by-matchday.md
 * decisions/033-home-vs-away.md
 */
export const MARGIN = { top: 16, right: 16, bottom: 56, left: 72 } as const;

/**
 * The axis font, larger below `sm`: the text is inside the `viewBox`, so it
 * scales down with the drawing.
 *
 * decisions/033-home-vs-away.md
 */
const AXIS_TEXT = "text-[19px] sm:text-xs";

/**
 * `AXIS_TEXT`'s size below `sm`, in units: the width a phone's labels need.
 *
 * decisions/048-league-goals-per-game-trend.md
 */
export const PHONE_AXIS_UNITS = 19;

/**
 * A glyph's width as a share of the font size: near enough for the UI font.
 *
 * decisions/048-league-goals-per-game-trend.md
 */
const GLYPH_WIDTH = 0.6;

/**
 * The least space between two x labels on a phone, in units.
 *
 * decisions/048-league-goals-per-game-trend.md
 */
const TICK_GAP = 8;

/**
 * How wide a label prints on a phone, the widest the axis text gets.
 *
 * decisions/048-league-goals-per-game-trend.md
 */
function phoneWidth(label: string): number {
  return label.length * GLYPH_WIDTH * PHONE_AXIS_UNITS;
}

/**
 * The y-axis caption as the lines it prints on: one, or two broken at the
 * space nearest its middle when it is longer than the plot is tall on a phone.
 *
 * decisions/050-table-volatility.md
 */
export function captionLines(label: string, plotHeight: number): string[] {
  if (phoneWidth(label) <= plotHeight) return [label];
  const middle = label.length / 2;
  const breakAt = [...label]
    .map((character, index) => (character === " " ? index : -1))
    .filter((index) => index !== -1)
    .sort((left, right) => Math.abs(left - middle) - Math.abs(right - middle))[0];
  return breakAt === undefined ? [label] : [label.slice(0, breakAt), label.slice(breakAt + 1)];
}

/**
 * Whether any two neighbouring labels, centred at `x`, would touch on a phone.
 *
 * decisions/048-league-goals-per-game-trend.md
 */
function crowdedOnPhone(labels: readonly { x: number; width: number }[]): boolean {
  let previousEnd = Number.NEGATIVE_INFINITY;
  for (const label of labels) {
    if (label.x - label.width / 2 < previousEnd + TICK_GAP) return true;
    previousEnd = label.x + label.width / 2;
  }
  return false;
}

/**
 * `value` mapped from `domain` onto `range`, linearly. A domain of one value
 * maps to the middle of the range.
 *
 * decisions/030-league-position-by-matchday.md
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
 * them, a whole step apart.
 *
 * decisions/030-league-position-by-matchday.md
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
 * One line on a chart. A second series is told apart by its dash, not a
 * colour: every line is the theme's foreground.
 *
 * decisions/032-goals-scored-vs-conceded.md
 * decisions/053-elo-ratings.md
 * decisions/054-prediction-quality.md
 */
export type LineSeries = {
  /** What the line is, unique within its chart: its key, and `data-series`. */
  name: string;
  points: readonly ChartPoint[];
  dashed?: boolean;
  /**
   * A third style, for a reference line and not data.
   */
  dotted?: boolean;
  /**
   * `false` draws the line without a dot at every point. Marked points are
   * still ringed.
   */
  dots?: boolean;
};

/**
 * The dash pattern of a dashed series, shared with its legend sample.
 *
 * decisions/032-goals-scored-vs-conceded.md
 */
const DASH = "6 4";
/**
 * A dotted series' pattern, as short against its gaps as a dash is long.
 *
 * decisions/054-prediction-quality.md
 */
const DOT = "2 4";

/**
 * A line's dash pattern, the same for the line and its legend sample.
 *
 * decisions/054-prediction-quality.md
 */
function dashArray(style: Readonly<{ dashed?: boolean; dotted?: boolean }>): string | undefined {
  if (style.dotted) return DOT;
  return style.dashed ? DASH : undefined;
}

/**
 * The extra height a chart with tick notes reserves under its x-axis, so a
 * second line under a tick clears the axis caption.
 *
 * decisions/048-league-goals-per-game-trend.md
 */
const NOTE_ROW = 22;

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
  /** How a tick prints; the number itself by default. */
  formatXTick?: (tick: number) => string;
  formatYTick?: (tick: number) => string;
  /**
   * A second line under an x tick, or nothing. A chart with any note grows its
   * bottom margin.
   */
  xTickNote?: (tick: number) => string | undefined;
  /**
   * When the x labels would touch on a phone, label every other tick there,
   * counting back from the last, and every tick from `sm` up.
   */
  thinXTicksOnPhone?: boolean;
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
  formatXTick = String,
  formatYTick = String,
  xTickNote,
  thinXTicksOnPhone = false,
  labelledBy,
  describedBy,
}: Readonly<LineChartProps>) {
  const ticks = xTicks.map((value) => {
    const label = formatXTick(value);
    const note = xTickNote?.(value);
    return { value, label, note, labelWidth: phoneWidth(label), noteWidth: phoneWidth(note ?? "") };
  });
  const hasNotes = ticks.some((tick) => tick.note !== undefined);
  const left = MARGIN.left;
  const right = CHART.width - MARGIN.right;
  const top = MARGIN.top;
  const bottom = CHART.height - MARGIN.bottom - (hasNotes ? NOTE_ROW : 0);
  const yRange: [number, number] = invertY ? [top, bottom] : [bottom, top];
  // The last tick is centred on the plot's end, so the plot ends short of the
  // axis by what a wider label or note would overhang.
  const overhang = ticks
    .slice(-1)
    .map((tick) => Math.max(tick.labelWidth, tick.noteWidth) / 2 - MARGIN.right);
  const plotRight = right - Math.max(0, ...overhang);

  const toX = (value: number) => scale(value, xDomain, [left, plotRight]);
  const crowded =
    thinXTicksOnPhone &&
    crowdedOnPhone(ticks.map((tick) => ({ x: toX(tick.value), width: tick.labelWidth })));
  const phoneHidden = (index: number) => crowded && (ticks.length - 1 - index) % 2 === 1;
  const caption = captionLines(yLabel, bottom - top);
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
            {formatYTick(tick)}
          </text>
        ))}
        <text
          textAnchor="middle"
          transform={`translate(12 ${(top + bottom) / 2}) rotate(-90)`}
          x={0}
          y={0}
        >
          <tspan x={0}>{caption[0]}</tspan>
          {caption[1] === undefined ? null : (
            // Rotated, a positive `dy` moves the next line towards the plot.
            <tspan dy="1.2em" x={0}>
              {caption[1]}
            </tspan>
          )}
        </text>
      </g>

      <g className={`fill-muted ${AXIS_TEXT}`} data-part="x-axis">
        <line className="stroke-border" x1={left} x2={right} y1={bottom} y2={bottom} />
        {ticks.map((tick, index) => (
          <text
            className={phoneHidden(index) ? "max-sm:hidden" : undefined}
            key={tick.value}
            textAnchor="middle"
            x={toX(tick.value)}
            y={bottom + 18}
          >
            {tick.label}
            {tick.note === undefined ? null : (
              <tspan data-part="tick-note" dy={NOTE_ROW} x={toX(tick.value)}>
                {tick.note}
              </tspan>
            )}
          </text>
        ))}
        <text textAnchor="middle" x={(left + right) / 2} y={CHART.height - 6}>
          {xLabel}
        </text>
      </g>

      {series.map((line) => (
        <g
          data-dashed={line.dashed ? "" : undefined}
          data-dotted={line.dotted ? "" : undefined}
          data-part="series"
          data-series={line.name}
          key={line.name}
        >
          <polyline
            className="fill-none stroke-foreground"
            data-part="line"
            points={line.points.map((point) => `${toX(point.x)},${toY(point.y)}`).join(" ")}
            strokeDasharray={dashArray(line)}
            strokeLinejoin="round"
            strokeWidth={2}
          />
          <g data-part="points">
            {line.points
              .filter((point) => point.marked)
              .map((point) => (
                <circle
                  className="fill-none stroke-foreground"
                  cx={toX(point.x)}
                  cy={toY(point.y)}
                  data-marked=""
                  key={`marked-${point.x}`}
                  r={7}
                  strokeWidth={1.5}
                />
              ))}
            {(line.dots === false ? [] : line.points).map((point) =>
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
 * each line's style beside its label.
 *
 * decisions/032-goals-scored-vs-conceded.md
 */
export function LineLegend({
  items,
}: Readonly<{
  items: ReadonlyArray<{ label: string; dashed?: boolean; dotted?: boolean }>;
}>) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-muted text-sm">
      {items.map((item) => (
        <li className="flex items-center gap-2" key={item.label}>
          <svg aria-hidden="true" className="h-2 w-6" viewBox="0 0 24 8">
            <line
              className="stroke-foreground"
              strokeDasharray={dashArray(item)}
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
