import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CleanSheetChart, cleanSheetSentence } from "@/components/charts/clean-sheet-chart";
import { CHART, MARGIN } from "@/components/charts/line-chart";
import type { CleanSheetPoint } from "@/lib/clean-sheets";

const TOP = MARGIN.top;
const BOTTOM = CHART.height - MARGIN.bottom;

const points: CleanSheetPoint[] = [
  { match: 1, kept: 1, share: 100 },
  { match: 2, kept: 1, share: 50 },
  { match: 3, kept: 1, share: (1 / 3) * 100 },
];

function renderChart(shown: readonly CleanSheetPoint[] = points) {
  return render(<CleanSheetChart headingId="clean-sheets" points={shown} title="Nollapelit" />)
    .container;
}

function yOf(container: HTMLElement, index: number): number {
  return Number(container.querySelectorAll("[data-part=points] circle")[index]?.getAttribute("cy"));
}

describe("cleanSheetSentence", () => {
  it("gives the share and the count it is of", () => {
    expect(cleanSheetSentence({ match: 12, kept: 3, share: 25 })).toBe(
      "Nollapelien osuus 12. ottelun jälkeen: 25 % (3/12)."
    );
  });

  it("rounds the share to a whole percent, keeping the true count", () => {
    expect(cleanSheetSentence({ match: 3, kept: 1, share: (1 / 3) * 100 })).toBe(
      "Nollapelien osuus 3. ottelun jälkeen: 33 % (1/3)."
    );
  });
});

describe("CleanSheetChart", () => {
  it("runs the y-axis from 0 to 100, whatever the team's season", () => {
    const container = renderChart();
    const yAxis = container.querySelector("[data-part=y-axis]")?.textContent ?? "";

    expect(yAxis).toContain("0255075100");
    // 100 % at the top, a third of the way down for 33 %.
    expect(yOf(container, 0)).toBe(TOP);
    expect(yOf(container, 2)).toBeGreaterThan(yOf(container, 1));
  });

  it("puts 0 % on the axis rather than off the chart", () => {
    const container = renderChart([{ match: 1, kept: 0, share: 0 }]);

    expect(yOf(container, 0)).toBe(BOTTOM);
  });

  it("runs the x-axis over the matches, from the first", () => {
    const xAxis = renderChart().querySelector("[data-part=x-axis]")?.textContent ?? "";

    expect(xAxis.startsWith("1")).toBe(true);
    expect(xAxis).toContain("Ottelu");
  });

  it("lists every point as text, and the chart points at the list", () => {
    const container = renderChart();
    const list = container.querySelector("ol");

    expect([...(list?.querySelectorAll("li") ?? [])].map((item) => item.textContent)).toEqual([
      "Nollapelien osuus 1. ottelun jälkeen: 100 % (1/1).",
      "Nollapelien osuus 2. ottelun jälkeen: 50 % (1/2).",
      "Nollapelien osuus 3. ottelun jälkeen: 33 % (1/3).",
    ]);
    expect(container.querySelector("svg")?.getAttribute("aria-describedby")).toBe(list?.id);
    expect(container.querySelector("svg")?.getAttribute("aria-labelledby")).toBe("clean-sheets");
  });

  it("draws one series, not two", () => {
    expect(renderChart().querySelectorAll("[data-part=series]")).toHaveLength(1);
  });

  it("draws nothing, but still renders, for an empty series", () => {
    expect(renderChart([]).querySelectorAll("[data-part=points] circle")).toHaveLength(0);
  });
});
