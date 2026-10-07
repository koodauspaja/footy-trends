import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CHART,
  type ChartPoint,
  captionLines,
  formatDecimal,
  LineChart,
  LineLegend,
  type LineSeries,
  MARGIN,
  PHONE_AXIS_UNITS,
  percentText,
  scale,
  ticksFor,
} from "@/components/charts/line-chart";

/**
 * The shared line chart: scales, ticks, open points, labelled seasons, and the
 * axis text's size on a phone.
 *
 * decisions/030-league-position-by-matchday.md
 * decisions/032-goals-scored-vs-conceded.md
 * decisions/034-clean-sheets.md
 * decisions/048-league-goals-per-game-trend.md
 * decisions/050-table-volatility.md
 * decisions/054-prediction-quality.md
 * decisions/413-rounds-a-team-sat-out.md
 * decisions/441-line-chart-text-on-a-phone.md
 */

const TOP = MARGIN.top;
const BOTTOM = CHART.height - MARGIN.bottom;
const LEFT = MARGIN.left;
const RIGHT = CHART.width - MARGIN.right;

describe("scale", () => {
  it("maps a domain onto a range linearly", () => {
    expect(scale(5, [0, 10], [0, 100])).toBe(50);
    expect(scale(0, [0, 10], [0, 100])).toBe(0);
    expect(scale(10, [0, 10], [0, 100])).toBe(100);
  });

  it("maps onto a reversed range, which is how an axis turns upside down", () => {
    expect(scale(0, [0, 10], [100, 0])).toBe(100);
    expect(scale(10, [0, 10], [100, 0])).toBe(0);
  });

  it("puts a one-value domain in the middle rather than dividing by zero", () => {
    // One round played, or a league of one team.
    expect(scale(3, [3, 3], [0, 100])).toBe(50);
  });
});

describe("ticksFor", () => {
  it("includes both ends", () => {
    const ticks = ticksFor(1, 38, 7);

    expect(ticks[0]).toBe(1);
    expect(ticks.at(-1)).toBe(38);
  });

  it("steps by whole numbers, since rounds and places are counted", () => {
    expect(ticksFor(1, 38, 7).every((tick) => Number.isInteger(tick))).toBe(true);
  });

  it("does not crowd the last tick against the end", () => {
    // Step 7 from 1 would reach 36, two short of 38 — close enough to print
    // "36 38" side by side, so 36 is dropped.
    const ticks = ticksFor(1, 38, 7);

    expect(ticks).toEqual([1, 8, 15, 22, 29, 38]);
  });

  it("keeps every value of a short range", () => {
    expect(ticksFor(1, 4, 7)).toEqual([1, 2, 3, 4]);
  });

  it("gives a single tick for a single value", () => {
    expect(ticksFor(5, 5, 7)).toEqual([5]);
  });

  it("keeps the first tick even when it is close to the end", () => {
    expect(ticksFor(1, 2, 7)).toEqual([1, 2]);
  });

  it("keeps both ends when asked for fewer than two ticks", () => {
    // An axis without its end label is unreadable, so a count of 1 or 0 is
    // treated as 2 rather than returning one end alone.
    expect(ticksFor(1, 38, 1)).toEqual([1, 38]);
    expect(ticksFor(1, 38, 0)).toEqual([1, 38]);
  });
});

function chart(
  invertY: boolean,
  points: readonly ChartPoint[] = [
    { x: 1, y: 1 },
    { x: 3, y: 4 },
  ]
) {
  return render(
    <LineChart
      describedBy="chart-text"
      invertY={invertY}
      labelledBy="chart-heading"
      series={[{ name: "line", points }]}
      title="Sijoitus kierroksittain"
      xDomain={[1, 3]}
      xLabel="Kierros"
      xTicks={[1, 2, 3]}
      yDomain={[1, 4]}
      yLabel="Sijoitus"
      yTicks={[1, 4]}
    />
  ).container;
}

function twoSeries() {
  const series: LineSeries[] = [
    {
      name: "first",
      points: [
        { x: 1, y: 1 },
        { x: 3, y: 4 },
      ],
    },
    {
      name: "second",
      points: [
        { x: 1, y: 4 },
        { x: 3, y: 1 },
      ],
      dashed: true,
    },
  ];
  return render(
    <LineChart
      describedBy="chart-text"
      invertY
      labelledBy="chart-heading"
      series={series}
      title="Maalit otteluittain"
      xDomain={[1, 3]}
      xLabel="Ottelu"
      xTicks={[1, 3]}
      yDomain={[1, 4]}
      yLabel="Maaleja"
      yTicks={[1, 4]}
    />
  ).container;
}

function circles(container: HTMLElement) {
  return [...container.querySelectorAll("[data-part=points] circle")].map((circle) => ({
    cx: Number(circle.getAttribute("cx")),
    cy: Number(circle.getAttribute("cy")),
  }));
}

describe("LineChart", () => {
  it("draws the smallest value at the top when inverted — first place above the rest", () => {
    const [first, last] = circles(chart(true));

    expect(first?.cy).toBe(TOP);
    expect(last?.cy).toBe(BOTTOM);
  });

  it("draws the smallest value at the bottom when not inverted", () => {
    const [first, last] = circles(chart(false));

    expect(first?.cy).toBe(BOTTOM);
    expect(last?.cy).toBe(TOP);
  });

  it("spans the x-axis from the first point to the last", () => {
    const [first, last] = circles(chart(true));

    expect(first?.cx).toBe(LEFT);
    expect(last?.cx).toBe(RIGHT);
  });

  it("joins the points into one line, in order", () => {
    const line = chart(true).querySelector("[data-part=line]");

    expect(line?.getAttribute("points")).toBe(`${LEFT},${TOP} ${RIGHT},${BOTTOM}`);
  });

  it("names itself, and points at its heading and its text", () => {
    const svg = chart(true).querySelector("svg");

    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-labelledby")).toBe("chart-heading");
    expect(svg?.getAttribute("aria-describedby")).toBe("chart-text");
    expect(svg?.querySelector("title")?.textContent).toBe("Sijoitus kierroksittain");
  });

  it("labels both axes and their ticks", () => {
    const container = chart(true);
    const xAxis = container.querySelector("[data-part=x-axis]")?.textContent;
    const yAxis = container.querySelector("[data-part=y-axis]")?.textContent;

    expect(xAxis).toContain("Kierros");
    expect(xAxis).toContain("123");
    expect(yAxis).toContain("Sijoitus");
    expect(yAxis).toContain("14");
  });

  it("draws a grid line for every y tick", () => {
    expect(chart(true).querySelectorAll("[data-part=grid] line")).toHaveLength(2);
  });

  it("draws an open point as a ring, and every other point as a filled dot", () => {
    const container = chart(true, [
      { x: 1, y: 1 },
      { x: 3, y: 4, open: true },
    ]);
    const [filled, open] = container.querySelectorAll("[data-part=points] circle");

    expect(filled?.getAttribute("class")).toBe("fill-foreground");
    expect(filled?.hasAttribute("data-open")).toBe(false);
    // Background-filled, so the line does not show through the ring.
    expect(open?.getAttribute("class")).toBe("fill-background stroke-foreground");
    expect(open?.hasAttribute("data-open")).toBe(true);
    // Still at its value: an open point is marked, not moved.
    expect(Number(open?.getAttribute("cy"))).toBe(BOTTOM);
  });

  it("draws every series given, each its own line and points, in order", () => {
    const container = twoSeries();
    const lines = container.querySelectorAll("[data-part=series]");

    expect(lines).toHaveLength(2);
    expect([...lines].map((line) => line.getAttribute("data-series"))).toEqual(["first", "second"]);
    expect(lines[0]?.querySelector("[data-part=line]")?.getAttribute("points")).toBe(
      `${LEFT},${TOP} ${RIGHT},${BOTTOM}`
    );
    expect(lines[1]?.querySelector("[data-part=line]")?.getAttribute("points")).toBe(
      `${LEFT},${BOTTOM} ${RIGHT},${TOP}`
    );
    expect(lines[1]?.querySelectorAll("[data-part=points] circle")).toHaveLength(2);
  });

  it("tells a dashed series apart by its dash, not its colour", () => {
    const [solid, dashed] = twoSeries().querySelectorAll("[data-part=series]");
    const solidLine = solid?.querySelector("[data-part=line]");
    const dashedLine = dashed?.querySelector("[data-part=line]");

    expect(solid?.hasAttribute("data-dashed")).toBe(false);
    expect(solidLine?.hasAttribute("stroke-dasharray")).toBe(false);
    expect(dashed?.hasAttribute("data-dashed")).toBe(true);
    expect(dashedLine?.getAttribute("stroke-dasharray")).toBe("6 4");
    // One colour for both: the dash is the only difference.
    expect(dashedLine?.getAttribute("class")).toBe(solidLine?.getAttribute("class"));
  });

  it("draws a dotted series with its own pattern, so a reference line is a third style", () => {
    const { container } = render(
      <LineChart
        describedBy="chart-text"
        labelledBy="chart-heading"
        series={[
          {
            name: "reference",
            dotted: true,
            points: [
              { x: 1, y: 1 },
              { x: 3, y: 4 },
            ],
          },
        ]}
        title="Kalibrointi"
        xDomain={[1, 3]}
        xLabel="x"
        xTicks={[1, 3]}
        yDomain={[1, 4]}
        yLabel="y"
        yTicks={[1, 4]}
      />
    );
    const series = container.querySelector("[data-part=series]");

    expect(series?.hasAttribute("data-dotted")).toBe(true);
    expect(series?.hasAttribute("data-dashed")).toBe(false);
    expect(series?.querySelector("[data-part=line]")?.getAttribute("stroke-dasharray")).toBe("2 4");
  });

  it("uses the theme's colour tokens, so dark mode is not a second drawing", () => {
    const line = chart(true).querySelector("[data-part=line]");

    expect(line?.getAttribute("class")).toContain("stroke-foreground");
  });
});

describe("LineLegend", () => {
  it("names each line beside a sample of its style", () => {
    const { container } = render(
      <LineLegend
        items={[{ label: "Tehdyt maalit" }, { label: "Päästetyt maalit", dashed: true }]}
      />
    );
    const items = [...container.querySelectorAll("li")];

    expect(items.map((item) => item.textContent)).toEqual(["Tehdyt maalit", "Päästetyt maalit"]);
    expect(items[0]?.querySelector("line")?.hasAttribute("stroke-dasharray")).toBe(false);
    expect(items[1]?.querySelector("line")?.getAttribute("stroke-dasharray")).toBe("6 4");
    const { container: dotted } = render(<LineLegend items={[{ label: "Ref", dotted: true }]} />);
    expect(dotted.querySelector("line")?.getAttribute("stroke-dasharray")).toBe("2 4");
    // The sample is decoration: the label is what a screen reader reads.
    expect(items[1]?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("formatDecimal", () => {
  it("writes one decimal with a comma, as Finnish does", () => {
    expect(formatDecimal(2.2)).toBe("2,2");
    expect(formatDecimal(3)).toBe("3,0");
    expect(formatDecimal(0)).toBe("0,0");
  });

  it("prints a fifth exactly, whatever floating point makes of it", () => {
    // 0.2 × 3 is 0.6000000000000001 in floating point.
    expect(formatDecimal(0.2 * 3)).toBe("0,6");
  });
});

describe("percentText", () => {
  it("prints a whole percent with a no-break space before the sign", () => {
    expect(percentText(57.89)).toBe("58 %");
    expect(percentText(0)).toBe("0 %");
  });
});

// `text-xs` is 0,75rem, and inside a `viewBox` that is 12 user units.
const DESKTOP_AXIS_UNITS = 12;

// A line box, used to say the caption sits a whole line below the tick row.
const LINE_BOX = 1.2;

// A digit's width as a share of the font size: near enough for the UI font.
const DIGIT_WIDTH = 0.6;

// The axis font below `sm`, read from the class so the geometry checks follow
// it.
function mobileAxisSize(container: HTMLElement, part: string): number {
  const className = container.querySelector(`[data-part=${part}]`)?.getAttribute("class") ?? "";
  const size = /text-\[(\d+)px\]/.exec(className)?.[1];

  if (size === undefined) throw new Error(`No mobile axis size in "${className}"`);
  return Number(size);
}

// The clean-sheet chart's axis, verbatim: a share, so its ticks reach 100.
function shareChart() {
  return render(
    <LineChart
      describedBy="chart-text"
      invertY={false}
      labelledBy="chart-heading"
      series={[
        {
          name: "share",
          points: [
            { x: 1, y: 0 },
            { x: 38, y: 100 },
          ],
        },
      ]}
      title="Nollapelit"
      xDomain={[1, 38]}
      xLabel="Ottelu"
      xTicks={[1, 38]}
      yDomain={[0, 100]}
      yLabel="Nollapelien osuus"
      yTicks={ticksFor(0, 100, 5)}
    />
  ).container;
}

describe("LineChart axis text on a phone", () => {
  // The text is inside the viewBox, so it scales with the drawing. The font is the only
  // part of the chart a breakpoint can reach, since MARGIN is JavaScript: it is
  // enlarged below `sm`, where narrowing the drawing would cost the desktop canvas.
  it.each(["x-axis", "y-axis"])("enlarges %s text below sm, and keeps 12 units above", (part) => {
    const container = chart(true);
    const className = container.querySelector(`[data-part=${part}]`)?.getAttribute("class") ?? "";

    expect(className).toContain("sm:text-xs");
    expect(mobileAxisSize(container, part)).toBeGreaterThan(DESKTOP_AXIS_UNITS);
  });

  it("keeps the x-tick row a whole line clear of the axis caption", () => {
    const container = chart(true);
    const texts = [...container.querySelectorAll("[data-part=x-axis] text")];
    const tick = Number(texts[0]?.getAttribute("y"));
    const caption = Number(texts.at(-1)?.getAttribute("y"));

    // MARGIN.bottom carries both rows and cannot answer the breakpoint, so it
    // is sized for the enlarged text; at the old 44 these touched on a phone.
    expect(caption - tick).toBeGreaterThanOrEqual(mobileAxisSize(container, "x-axis") * LINE_BOX);
  });

  it("fits the widest y tick between the rotated caption and the plot", () => {
    // The clean-sheet chart's own axis, which is the tight case: a share runs
    // to 100, the widest tick any chart prints, under a long caption.
    const container = shareChart();
    const texts = [...container.querySelectorAll("[data-part=y-axis] text")];
    const ticks = texts.slice(0, -1);
    const caption = texts.at(-1)?.getAttribute("transform") ?? "";
    // The ticks are anchored at their end, so their x is where they stop.
    const tickEnd = Number(ticks[0]?.getAttribute("x"));
    const captionCentre = Number(/translate\((-?[\d.]+)/.exec(caption)?.[1]);
    const size = mobileAxisSize(container, "y-axis");
    const digits = Math.max(...ticks.map((tick) => (tick.textContent ?? "").length));

    expect(digits).toBe(3);
    expect(tickEnd - (captionCentre + size / 2)).toBeGreaterThanOrEqual(
      digits * size * DIGIT_WIDTH
    );
  });
});

// A season chart: labelled ticks, a note, a ring.
function seasonChart(notes: Record<number, string> = { 2026: "(kesken)" }) {
  return render(
    <LineChart
      describedBy="chart-text"
      formatXTick={(tick) => `${tick}/${String(tick + 1).slice(2)}`}
      formatYTick={formatDecimal}
      labelledBy="chart-heading"
      series={[
        {
          name: "goals-per-game",
          points: [
            { x: 2024, y: 2.5 },
            { x: 2025, y: 3, marked: true },
            { x: 2026, y: 2.75 },
          ],
        },
      ]}
      title="Maaleja ottelua kohden"
      xDomain={[2024, 2026]}
      xLabel="Kausi"
      xTickNote={(tick) => notes[tick]}
      xTicks={[2024, 2025, 2026]}
      yDomain={[2.5, 3]}
      yLabel="Maaleja / ottelu"
      yTicks={[2.5, 3]}
    />
  ).container;
}

describe("LineChart season axis (specs/048)", () => {
  it("prints each tick as it is told to, and the number itself by default", () => {
    const container = seasonChart();
    const xTicks = [...container.querySelectorAll("[data-part=x-axis] text")].slice(0, -1);
    const yTicks = [...container.querySelectorAll("[data-part=y-axis] text")].slice(0, -1);

    expect(xTicks.map((tick) => tick.firstChild?.textContent)).toEqual([
      "2024/25",
      "2025/26",
      "2026/27",
    ]);
    expect(yTicks.map((tick) => tick.textContent)).toEqual(["2,5", "3,0"]);
    // Every existing chart passes neither, and prints what it did before.
    expect(chart(true).querySelector("[data-part=y-axis] text")?.textContent).toBe("1");
  });

  it("writes a note on a second line under its own tick only (S15)", () => {
    const container = seasonChart();
    const notes = container.querySelectorAll("[data-part=tick-note]");
    const lastTick = [...container.querySelectorAll("[data-part=x-axis] text")].at(-2);

    expect(notes).toHaveLength(1);
    expect(notes[0]?.textContent).toBe("(kesken)");
    expect(notes[0]?.parentElement).toBe(lastTick);
    expect(notes[0]?.getAttribute("x")).toBe(lastTick?.getAttribute("x"));
    expect(Number(notes[0]?.getAttribute("dy"))).toBeGreaterThan(0);
  });

  it("lifts the plot by the note's row, so the note sits where a tick would and clears the caption", () => {
    const withNote = seasonChart();
    const texts = [...withNote.querySelectorAll("[data-part=x-axis] text")];
    const tick = Number(texts[0]?.getAttribute("y"));
    const dy = Number(withNote.querySelector("[data-part=tick-note]")?.getAttribute("dy"));
    const axis = Number(withNote.querySelector("[data-part=x-axis] line")?.getAttribute("y1"));

    expect(axis).toBe(BOTTOM - dy);
    // Where a chart without notes prints its tick row: already a line clear
    // of the caption, which the test above holds.
    expect(tick + dy).toBe(BOTTOM + 18);
  });

  it("keeps the full plot when no tick has a note", () => {
    const container = seasonChart({});
    const axis = container.querySelector("[data-part=x-axis] line");

    expect(container.querySelector("[data-part=tick-note]")).toBeNull();
    expect(Number(axis?.getAttribute("y1"))).toBe(BOTTOM);
  });

  it("rings a marked point, behind its dot and at its value (S11)", () => {
    const container = seasonChart();
    const rings = container.querySelectorAll("[data-part=points] [data-marked]");
    const all = [...container.querySelectorAll("[data-part=points] circle")];
    const ring = rings[0];

    expect(rings).toHaveLength(1);
    expect(all[0]).toBe(ring);
    expect(ring?.getAttribute("class")).toBe("fill-none stroke-foreground");
    const [first, , last] = circles(container).slice(1);
    expect(Number(ring?.getAttribute("cx"))).toBe(((first?.cx ?? 0) + (last?.cx ?? 0)) / 2);
    expect(Number(ring?.getAttribute("r"))).toBeGreaterThan(4);
    // The dot is still drawn: the ring picks the season out, it does not replace it.
    expect(
      all.filter((circle) => circle.getAttribute("cx") === ring?.getAttribute("cx"))
    ).toHaveLength(2);
  });

  it("ends the plot short of the axis by what a wide last label lacks, so it stays on the drawing", () => {
    const container = seasonChart();
    const note = container.querySelector("[data-part=tick-note]");
    const noteWidth = "(kesken)".length * 0.6 * PHONE_AXIS_UNITS;
    const lastX = Number(note?.getAttribute("x"));

    expect(lastX + noteWidth / 2).toBeCloseTo(RIGHT + MARGIN.right);
    // The axis itself still runs the full width.
    expect(container.querySelector("[data-part=x-axis] line")?.getAttribute("x2")).toBe(
      String(RIGHT)
    );
    // A chart whose last label fits the margin keeps its whole plot.
    expect(circles(chart(true)).at(-1)?.cx).toBe(RIGHT);
  });
});

// Twelve seasons of a calendar-year league: too many labels for a phone.
function twelveSeasons(thin: boolean, from = 2015, count = 12) {
  const seasons = Array.from({ length: count }, (_, index) => from + index);
  return render(
    <LineChart
      describedBy="chart-text"
      labelledBy="chart-heading"
      series={[{ name: "line", points: seasons.map((x) => ({ x, y: 3 })) }]}
      thinXTicksOnPhone={thin}
      title="Maaleja ottelua kohden"
      xDomain={[from, from + count - 1]}
      xLabel="Kausi"
      xTickNote={(tick) => (tick === from + count - 1 ? "(kesken)" : undefined)}
      xTicks={seasons}
      yDomain={[2.5, 3.5]}
      yLabel="Maaleja / ottelu"
      yTicks={[2.5, 3, 3.5]}
    />
  ).container;
}

function phoneHiddenTicks(container: HTMLElement) {
  return [...container.querySelectorAll("[data-part=x-axis] text")]
    .filter((text) => text.getAttribute("class") === "max-sm:hidden")
    .map((text) => text.firstChild?.textContent);
}

describe("LineChart season labels on a phone (specs/048, S16)", () => {
  it("hides every other label below sm, counting back from the latest, when they would touch", () => {
    expect(phoneHiddenTicks(twelveSeasons(true))).toEqual([
      "2015",
      "2017",
      "2019",
      "2021",
      "2023",
      "2025",
    ]);
  });

  it("keeps every label when they fit", () => {
    expect(phoneHiddenTicks(twelveSeasons(true, 2020, 4))).toEqual([]);
  });

  it("thins only a chart that asks for it", () => {
    expect(phoneHiddenTicks(twelveSeasons(false))).toEqual([]);
  });
});

describe("captionLines (specs/050)", () => {
  it("keeps a caption that fits the plot's height at a phone's font on one line", () => {
    expect(captionLines("Maaleja / ottelu", 248)).toEqual(["Maaleja / ottelu"]);
  });

  it("breaks one that does not at the space nearest its middle", () => {
    expect(captionLines("Sijoitusmuutos keskimäärin", 248)).toEqual([
      "Sijoitusmuutos",
      "keskimäärin",
    ]);
    expect(captionLines("Yksi kaksi kolme neljä viisi kuusi", 248)).toEqual([
      "Yksi kaksi kolme",
      "neljä viisi kuusi",
    ]);
  });

  it("prints both halves of a caption that breaks into two equal lines", () => {
    // A duplicate React key, as when each line is keyed by its text, is
    // reported through console.error, and may drop a line on a later render.
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Restored in `finally`: a failing assertion would otherwise leave
    // console.error silenced for every later test in the file.
    try {
      const { container } = render(
        <LineChart
          describedBy="chart-text"
          labelledBy="chart-heading"
          series={[{ name: "line", points: [{ x: 1, y: 1 }] }]}
          title="Kaksi"
          xDomain={[1, 2]}
          xLabel="Kausi"
          xTicks={[1, 2]}
          yDomain={[0, 2]}
          yLabel="Sijoitusmuutoskeskiarvo Sijoitusmuutoskeskiarvo"
          yTicks={[0, 1, 2]}
        />
      );

      expect(
        [...container.querySelectorAll("[data-part=y-axis] text:last-child tspan")].map(
          (line) => line.textContent
        )
      ).toEqual(["Sijoitusmuutoskeskiarvo", "Sijoitusmuutoskeskiarvo"]);
      expect(error.mock.calls.flat().join(" ")).not.toContain("same key");
    } finally {
      error.mockRestore();
    }
  });

  it("leaves a caption with no space whole", () => {
    expect(captionLines("Sijoitusmuutoskeskimäärin", 100)).toEqual(["Sijoitusmuutoskeskimäärin"]);
  });

  it("prints a broken caption as two lines, the second towards the plot", () => {
    const { container } = render(
      <LineChart
        describedBy="chart-text"
        labelledBy="chart-heading"
        series={[{ name: "line", points: [{ x: 1, y: 1 }] }]}
        title="Sijoitusten vaihtelu"
        xDomain={[1, 2]}
        xLabel="Kausi"
        xTicks={[1, 2]}
        yDomain={[0, 2]}
        yLabel="Sijoitusmuutos keskimäärin"
        yTicks={[0, 1, 2]}
      />
    );
    const lines = [...container.querySelectorAll("[data-part=y-axis] text:last-child tspan")];

    expect(lines.map((line) => line.textContent)).toEqual(["Sijoitusmuutos", "keskimäärin"]);
    expect(lines.map((line) => line.getAttribute("dy"))).toEqual([null, "1.2em"]);
  });
});
