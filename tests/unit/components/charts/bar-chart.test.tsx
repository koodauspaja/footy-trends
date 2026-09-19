import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BarChart,
  BarLegend,
  type BarRow,
  barLength,
  rowHeight,
  TRACK,
} from "@/components/charts/bar-chart";

const rows: BarRow[] = [
  {
    label: "Pisteitä / ottelu",
    max: 3,
    bars: [
      { name: "home", value: 1.5, text: "1,50" },
      { name: "away", value: 3, text: "3,00", outlined: true },
    ],
  },
  {
    label: "Voittoprosentti",
    max: 100,
    bars: [
      { name: "home", value: 25, text: "25 %" },
      { name: "away", value: null, text: "–", outlined: true },
    ],
  },
];

function renderChart(shown: readonly BarRow[] = rows) {
  return render(
    <BarChart
      describedBy="text"
      labelledBy="heading"
      rows={shown}
      title="Koti- ja vierastilastot"
    />
  ).container;
}

function fills(container: HTMLElement) {
  return [...container.querySelectorAll("[data-part=fill]")];
}

describe("barLength", () => {
  it("is the value's share of its scale, over the track", () => {
    expect(barLength(1.5, 3)).toBe(TRACK / 2);
    expect(barLength(3, 3)).toBe(TRACK);
    expect(barLength(0, 3)).toBe(0);
  });

  it("stops at the end of the track for a value past the scale", () => {
    expect(barLength(4.4, 4)).toBe(TRACK);
  });

  it("draws nothing, not backwards, for a value below zero", () => {
    expect(barLength(-1, 3)).toBe(0);
  });
});

describe("rowHeight", () => {
  it("grows by one bar and one gap per bar", () => {
    expect(rowHeight(3) - rowHeight(2)).toBe(rowHeight(2) - rowHeight(1));
    expect(rowHeight(2)).toBeGreaterThan(rowHeight(1));
  });
});

describe("BarChart", () => {
  it("names itself, and points at its heading and its text", () => {
    const svg = renderChart().querySelector("svg");

    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-labelledby")).toBe("heading");
    expect(svg?.getAttribute("aria-describedby")).toBe("text");
    expect(svg?.querySelector("title")?.textContent).toBe("Koti- ja vierastilastot");
  });

  it("draws each bar against its own row's scale", () => {
    // 1,5 of 3 is half the track; 25 of 100 a quarter, on a different scale.
    const [half, full, quarter] = fills(renderChart());

    expect(Number(half?.getAttribute("width"))).toBe(TRACK / 2);
    // Outlined: inset by half its stroke on each side.
    expect(Number(full?.getAttribute("width"))).toBe(TRACK - 1.5);
    expect(Number(quarter?.getAttribute("width"))).toBe(TRACK / 4);
  });

  it("tells bars apart by fill, not colour", () => {
    const [filled, outlined] = fills(renderChart());

    expect(filled?.getAttribute("class")).toBe("fill-foreground");
    expect(filled?.hasAttribute("data-outlined")).toBe(false);
    expect(outlined?.getAttribute("class")).toBe("fill-background stroke-foreground");
    expect(outlined?.hasAttribute("data-outlined")).toBe(true);
  });

  it("prints every bar's value, and draws no bar where there is none", () => {
    const container = renderChart();
    const values = [...container.querySelectorAll("[data-part=value]")].map((v) => v.textContent);

    expect(values).toEqual(["1,50", "3,00", "25 %", "–"]);
    // Four tracks, three fills: the away win share has nothing to draw yet.
    expect(container.querySelectorAll("[data-part=track]")).toHaveLength(4);
    expect(fills(container)).toHaveLength(3);
  });

  it("labels each row and keys each bar by its name", () => {
    const container = renderChart();
    const rowGroups = [...container.querySelectorAll("[data-part=row]")];

    expect(rowGroups.map((row) => row.querySelector("text")?.textContent)).toEqual([
      "Pisteitä / ottelu",
      "Voittoprosentti",
    ]);
    expect(
      [...(rowGroups[0]?.querySelectorAll("[data-part=bar]") ?? [])].map((bar) =>
        bar.getAttribute("data-bar")
      )
    ).toEqual(["home", "away"]);
  });

  it("stacks rows one under another, as tall as they add up to", () => {
    const container = renderChart();
    const labels = [...container.querySelectorAll("[data-part=row] > text")];

    expect(Number(labels[1]?.getAttribute("y"))).toBe(rowHeight(2));
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe(
      `0 0 400 ${2 * rowHeight(2)}`
    );
  });

  it("uses the theme's colour tokens, so dark mode is not a second drawing", () => {
    const track = renderChart().querySelector("[data-part=track]");

    expect(track?.getAttribute("class")).toBe("fill-border-subtle");
  });
});

describe("BarLegend", () => {
  it("names each bar beside a sample of its fill", () => {
    const { container } = render(
      <BarLegend
        items={[
          { label: "Kotona (19 ottelua)" },
          { label: "Vieraissa (19 ottelua)", outlined: true },
        ]}
      />
    );
    const items = [...container.querySelectorAll("li")];

    expect(items.map((item) => item.textContent)).toEqual([
      "Kotona (19 ottelua)",
      "Vieraissa (19 ottelua)",
    ]);
    expect(items[0]?.querySelector("rect")?.getAttribute("class")).toBe("fill-foreground");
    expect(items[1]?.querySelector("rect")?.getAttribute("class")).toBe(
      "fill-background stroke-foreground"
    );
    expect(items[1]?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
