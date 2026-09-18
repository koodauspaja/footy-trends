import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CHART, MARGIN } from "@/components/charts/line-chart";
import { PositionChart, positionSentence } from "@/components/charts/position-chart";

const TOP = MARGIN.top;
const BOTTOM = CHART.height - MARGIN.bottom;

const points = [
  { round: 1, position: 3 },
  { round: 2, position: 4 },
  { round: 3, position: 1 },
];

function renderChart(teamCount = 4, shown = points) {
  return render(
    <PositionChart
      headingId="sijoitus"
      points={shown}
      teamCount={teamCount}
      title="Sijoitus kierroksittain"
    />
  ).container;
}

function yOf(container: HTMLElement, index: number): number {
  return Number(container.querySelectorAll("[data-part=points] circle")[index]?.getAttribute("cy"));
}

describe("positionSentence", () => {
  it("says the round and the position, as the spec words it", () => {
    expect(positionSentence({ round: 12, position: 3 })).toBe(
      "Sijoitus 12. kierroksen jälkeen: 3."
    );
  });
});

describe("PositionChart", () => {
  it("puts first place at the top of the chart", () => {
    const container = renderChart();

    // Round 3 is first place; round 2 is last of four.
    expect(yOf(container, 2)).toBe(TOP);
    expect(yOf(container, 1)).toBe(BOTTOM);
  });

  it("spans the whole league, not only the places this team visited", () => {
    // Never below 4th in a league of 20: the axis still runs to 20, so a
    // mid-table team does not look like it fell to the bottom.
    const container = renderChart(20);
    const yAxis = container.querySelector("[data-part=y-axis]")?.textContent ?? "";

    expect(yAxis).toContain("20");
    expect(yOf(container, 2)).toBe(TOP);
    expect(yOf(container, 1)).toBeLessThan(BOTTOM);
  });

  it("labels its axes in Finnish", () => {
    const container = renderChart();

    expect(container.querySelector("[data-part=x-axis]")?.textContent).toContain("Kierros");
    expect(container.querySelector("[data-part=y-axis]")?.textContent).toContain("Sijoitus");
  });

  it("lists every round and position as text, and the chart points at the list", () => {
    const container = renderChart();
    const list = screen.getByRole("list");

    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([
      "Sijoitus 1. kierroksen jälkeen: 3.",
      "Sijoitus 2. kierroksen jälkeen: 4.",
      "Sijoitus 3. kierroksen jälkeen: 1.",
    ]);
    expect(container.querySelector("svg")?.getAttribute("aria-describedby")).toBe(list.id);
  });

  it("names itself by its heading", () => {
    expect(renderChart().querySelector("svg")?.getAttribute("aria-labelledby")).toBe("sijoitus");
  });

  it("draws a single played round without dividing by zero", () => {
    const container = renderChart(4, [{ round: 1, position: 2 }]);
    const cx = Number(container.querySelector("[data-part=points] circle")?.getAttribute("cx"));

    expect(Number.isFinite(cx)).toBe(true);
  });

  it("draws nothing, but still renders, for an empty series", () => {
    // The section never passes one; the chart should not throw if it did.
    const container = renderChart(4, []);

    expect(container.querySelectorAll("[data-part=points] circle")).toHaveLength(0);
  });
});
