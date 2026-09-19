import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CHART,
  type ChartPoint,
  LineChart,
  MARGIN,
  scale,
  ticksFor,
} from "@/components/charts/line-chart";

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
      points={points}
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

  it("uses the theme's colour tokens, so dark mode is not a second drawing", () => {
    const line = chart(true).querySelector("[data-part=line]");

    expect(line?.getAttribute("class")).toContain("stroke-foreground");
  });
});
