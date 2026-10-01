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
  /**
   * Ringed, to pick one point out of the line — the season a page is showing
   * (specs/048, S11).
   */
  marked?: boolean;
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

/** `AXIS_TEXT`'s size below `sm`, in units — the width a phone's labels need. */
export const PHONE_AXIS_UNITS = 19;

/** A glyph's width as a share of the font size — near enough for the UI font. */
const GLYPH_WIDTH = 0.6;

/** The least space between two x labels on a phone, in units. */
const TICK_GAP = 8;

/** How wide a label prints on a phone, the widest the axis text gets. */
function phoneWidth(label: string): number {
  return label.length * GLYPH_WIDTH * PHONE_AXIS_UNITS;
}

/**
 * The y-axis caption as the lines it prints on: one, unless it is longer than
 * the plot is tall at a phone's font, when it breaks at the space nearest its
 * middle — `Sijoitusmuutos keskimäärin` (specs/050) ran off both ends of the
 * drawing at 375 px. A caption with no space stays whole.
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

/** Whether any two neighbouring labels, centred at `x`, would touch on a phone. */
function crowdedOnPhone(labels: readonly { x: number; width: number }[]): boolean {
  let previousEnd = Number.NEGATIVE_INFINITY;
  for (const label of labels) {
    if (label.x - label.width / 2 < previousEnd + TICK_GAP) return true;
    previousEnd = label.x + label.width / 2;
  }
  return false;
}

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
  /**
   * `false` draws the line without a dot at every point — a team's rating
   * after each of hundreds of matches (specs/053) would be a row of dots.
   * Marked points are still ringed.
   */
  dots?: boolean;
};

/** The dash pattern of a dashed series, shared with its legend sample. */
const DASH = "6 4";

/**
 * The extra height a chart with tick notes reserves under its x-axis, so a
 * second line under a tick clears the axis caption (specs/048, S15).
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
   * A second line under an x tick, or nothing — `(kesken)` under the season in
   * progress (specs/048, S15). A chart with any note grows its bottom margin.
   */
  xTickNote?: (tick: number) => string | undefined;
  /**
   * When the x labels would touch on a phone, label every other tick there,
   * counting back from the last — so the latest season and its note always
   * show — and every tick from `sm` up (specs/048, S16).
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
  // The last tick is centred on the plot's end, so a label or note wider than
  // twice the margin would run off the drawing: the plot ends short of the
  // axis by what it lacks. Every chart before specs/048 needs none.
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
