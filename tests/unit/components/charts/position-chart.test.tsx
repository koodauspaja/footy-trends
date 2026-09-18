import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CHART, MARGIN } from "@/components/charts/line-chart";
import {
  OPEN_POINT_LEGEND,
  PositionChart,
  positionSentence,
} from "@/components/charts/position-chart";
import type { PositionPoint } from "@/lib/position-series";

const TOP = MARGIN.top;
const BOTTOM = CHART.height - MARGIN.bottom;

const points: PositionPoint[] = [
  { round: 1, position: 3, played: true },
  { round: 2, position: 4, played: true },
  { round: 3, position: 1, played: true },
];

function renderChart(teamCount = 4, shown = points) {
  return render(
    <PositionChart
      headingId="position"
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
    expect(positionSentence({ round: 12, position: 3, played: true })).toBe(
      "Sijoitus 12. kierroksen jälkeen: 3."
    );
  });

  it("says when the team did not play that round, as the open circle does", () => {
    expect(positionSentence({ round: 25, position: 2, played: false })).toBe(
      "Sijoitus 25. kierroksen jälkeen: 2 (ei omaa ottelua)."
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
    expect(renderChart().querySelector("svg")?.getAttribute("aria-labelledby")).toBe("position");
  });

  it("draws a single played round without dividing by zero", () => {
    const container = renderChart(4, [{ round: 1, position: 2, played: true }]);
    const cx = Number(container.querySelector("[data-part=points] circle")?.getAttribute("cx"));

    expect(Number.isFinite(cx)).toBe(true);
  });

  it("draws a round the team sat out as an open circle", () => {
    const container = renderChart(4, [
      { round: 1, position: 3, played: true },
      { round: 2, position: 2, played: false },
      { round: 3, position: 2, played: true },
    ]);
    const open = [...container.querySelectorAll("[data-part=points] circle")].map((circle) =>
      circle.hasAttribute("data-open")
    );

    expect(open).toEqual([false, true, false]);
  });

  it("explains the open circle beneath the chart when there is one", () => {
    renderChart(4, [
      { round: 1, position: 3, played: true },
      { round: 2, position: 2, played: false },
    ]);

    expect(screen.getByText(OPEN_POINT_LEGEND)).toBeVisible();
    expect(OPEN_POINT_LEGEND).toBe("Avoin pallo: joukkue ei pelannut kierroksella.");
  });

  it("shows no legend when every round was played", () => {
    renderChart();

    expect(screen.queryByText(OPEN_POINT_LEGEND)).toBeNull();
  });

  it("draws nothing, but still renders, for an empty series", () => {
    // The section never passes one; the chart should not throw if it did.
    const container = renderChart(4, []);

    expect(container.querySelectorAll("[data-part=points] circle")).toHaveLength(0);
  });
});
