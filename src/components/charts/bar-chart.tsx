/**
 * The app's bar chart: rows of horizontal bars, drawn as SVG on the server
 * (specs/033), beside `LineChart` and in the same way — no client JavaScript,
 * geometry in exported functions tested directly, theme tokens only.
 *
 * **Every row has its own scale**, because a row is a measure and measures do
 * not share units: points per match, goals per match, a percentage. Each bar
 * sits on a faint track the length of its row's scale, so the scale is visible,
 * and its value is printed just past the track, in one column for every bar —
 * easier to scan than text at each bar's own end, and never over the track's
 * faint fill — so the chart reads exactly without an axis.
 *
 * Bars in a row are told apart by fill, not colour: filled or outlined, both in
 * the foreground colour (specs/033, Q6), with `BarLegend` to name them.
 */

/**
 * The drawing's width, in SVG user units; `viewBox` scales it to the page.
 *
 * Narrower than `LineChart`'s 640, and shown no wider than `max-w-md`: the
 * text here is most of the content, and it scales with the drawing. At 400
 * units a phone's width shows it at about 0,86× and a desktop at about 1,1×;
 * at 640 a phone would show it at about half size.
 */
const WIDTH = 400;
/** Room at the right of the longest bar for its printed value, e.g. `100 %`. */
const VALUE_ROOM = 64;
/** The length a bar at its row's full scale reaches. */
export const TRACK = WIDTH - VALUE_ROOM;

const LABEL_HEIGHT = 20;
const BAR_HEIGHT = 14;
const BAR_GAP = 4;
const ROW_GAP = 16;

export type Bar = {
  /** What the bar is, unique within its row: its key, and `data-bar`. */
  name: string;
  /** `null` draws no bar: nothing to measure yet (specs/033, Q7). */
  value: number | null;
  /** What is printed at the bar's end, and read out: the true value, formatted. */
  text: string;
  outlined?: boolean;
};

export type BarRow = {
  label: string;
  /** The row's scale: a bar at this value fills its track. */
  max: number;
  bars: readonly Bar[];
};

/**
 * A bar's length for `value` on a scale of `max`, over `track` units.
 *
 * Kept within the track: a value past the scale fills it and no more, and its
 * printed text still states the true number (specs/033, Q3). A negative value
 * cannot occur in these measures, but draws as nothing rather than backwards.
 */
export function barLength(value: number, max: number, track = TRACK): number {
  return Math.min(Math.max(value / max, 0), 1) * track;
}

/** The height one row takes: its label, its bars, and the gap below. */
export function rowHeight(barCount: number): number {
  return LABEL_HEIGHT + barCount * BAR_HEIGHT + (barCount - 1) * BAR_GAP + ROW_GAP;
}

export function BarChart({
  title,
  rows,
  labelledBy,
  describedBy,
}: Readonly<{
  /** The chart's own name, in a `<title>`: it travels with the SVG wherever it is shown. */
  title: string;
  rows: readonly BarRow[];
  /** The element that names the chart — its heading. */
  labelledBy: string;
  /** The element that lists its values as text. */
  describedBy: string;
}>) {
  // Each row starts where the rows above it end.
  let height = 0;
  const placed = rows.map((row) => {
    const top = height;
    height += rowHeight(row.bars.length);
    return { row, top };
  });

  return (
    <svg
      aria-describedby={describedBy}
      aria-labelledby={labelledBy}
      className="h-auto w-full max-w-md"
      role="img"
      viewBox={`0 0 ${WIDTH} ${height}`}
    >
      <title>{title}</title>
      {placed.map(({ row, top }) => (
        <g data-part="row" key={row.label}>
          <text className="fill-muted text-xs" dominantBaseline="hanging" x={0} y={top}>
            {row.label}
          </text>
          {row.bars.map((bar, barIndex) => {
            const y = top + LABEL_HEIGHT + barIndex * (BAR_HEIGHT + BAR_GAP);
            const length = bar.value === null ? 0 : barLength(bar.value, row.max);
            return (
              <g data-bar={bar.name} data-part="bar" key={bar.name}>
                <rect
                  className="fill-border-subtle"
                  data-part="track"
                  height={BAR_HEIGHT}
                  width={TRACK}
                  x={0}
                  y={y}
                />
                {/* Nothing to draw at zero: an outline around a zero-width bar
                    would still show as a sliver at the axis. */}
                {bar.value === null || length === 0 ? null : (
                  <rect
                    className={
                      bar.outlined ? "fill-background stroke-foreground" : "fill-foreground"
                    }
                    data-outlined={bar.outlined ? "" : undefined}
                    data-part="fill"
                    // An outline is drawn half inside the rectangle, so it is
                    // inset by half its width to stay within the track.
                    height={bar.outlined ? BAR_HEIGHT - 1.5 : BAR_HEIGHT}
                    strokeWidth={bar.outlined ? 1.5 : undefined}
                    width={bar.outlined ? Math.max(length - 1.5, 0) : length}
                    x={bar.outlined ? 0.75 : 0}
                    y={bar.outlined ? y + 0.75 : y}
                  />
                )}
                <text
                  className="fill-foreground text-xs"
                  data-part="value"
                  dominantBaseline="middle"
                  x={TRACK + 8}
                  y={y + BAR_HEIGHT / 2}
                >
                  {bar.text}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

/**
 * Which bar is which, beneath the chart: a small sample of each bar's fill
 * beside its label.
 */
export function BarLegend({
  items,
}: Readonly<{ items: ReadonlyArray<{ label: string; outlined?: boolean }> }>) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-muted text-sm">
      {items.map((item) => (
        <li className="flex items-center gap-2" key={item.label}>
          <svg aria-hidden="true" className="h-3 w-5" viewBox="0 0 20 12">
            <rect
              className={item.outlined ? "fill-background stroke-foreground" : "fill-foreground"}
              height={item.outlined ? 10.5 : 12}
              strokeWidth={item.outlined ? 1.5 : undefined}
              width={item.outlined ? 18.5 : 20}
              x={item.outlined ? 0.75 : 0}
              y={item.outlined ? 0.75 : 0}
            />
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
