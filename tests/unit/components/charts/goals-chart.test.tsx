import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CONCEDED_LABEL,
  GoalsChart,
  ROLLING_TOP,
  rollingSentence,
  SCORED_LABEL,
  totalsSentence,
  totalsTicks,
  totalsTop,
} from "@/components/charts/goals-chart";
import { CHART, MARGIN } from "@/components/charts/line-chart";
import type { GoalsPoint } from "@/lib/goals-series";

const TOP = MARGIN.top;
const BOTTOM = CHART.height - MARGIN.bottom;

const points: GoalsPoint[] = [
  { match: 5, scored: 2.2, conceded: 0.6 },
  { match: 6, scored: 1.4, conceded: 1.8 },
];

function renderChart(shown: readonly GoalsPoint[] = points, yTop = ROLLING_TOP) {
  return render(
    <GoalsChart
      headingId="goals"
      points={shown}
      sentence={rollingSentence}
      title="Maalit otteluittain"
      yLabel="Maaleja / ottelu"
      yTicks={[0, yTop]}
      yTop={yTop}
    />
  ).container;
}

function seriesY(container: HTMLElement, series: number): number[] {
  const group = container.querySelectorAll("[data-part=series]")[series];
  return [...(group?.querySelectorAll("circle") ?? [])].map((circle) =>
    Number(circle.getAttribute("cy"))
  );
}

describe("the rolling axis", () => {
  it("is one fixed top for every league and season", () => {
    expect(ROLLING_TOP).toBe(5);
  });
});

describe("totalsTop", () => {
  it("rounds the team's highest total up to a whole ten", () => {
    expect(totalsTop([{ match: 1, scored: 69, conceded: 34 }])).toBe(70);
    expect(totalsTop([{ match: 1, scored: 30, conceded: 41 }])).toBe(50);
  });

  it("keeps a total already on a ten", () => {
    expect(totalsTop([{ match: 1, scored: 40, conceded: 12 }])).toBe(40);
  });

  it("is never below ten, so a goalless start still has an axis", () => {
    expect(totalsTop([{ match: 1, scored: 0, conceded: 0 }])).toBe(10);
    expect(totalsTop([])).toBe(10);
  });
});

describe("totalsTicks", () => {
  it("puts a tick on every ten, up to the top", () => {
    expect(totalsTicks(70)).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
    expect(totalsTicks(10)).toEqual([0, 10]);
  });
});

describe("the text rows", () => {
  it("says both rolling values with decimal commas", () => {
    expect(rollingSentence({ match: 12, scored: 1.4, conceded: 0.6 })).toBe(
      "Maalit 12. ottelun jälkeen: tehdyt 1,4, päästetyt 0,6 ottelua kohden."
    );
  });

  it("says both totals as whole goals", () => {
    expect(totalsSentence({ match: 38, scored: 69, conceded: 34 })).toBe(
      "Maalit yhteensä 38. ottelun jälkeen: tehdyt 69, päästetyt 34."
    );
  });
});

describe("GoalsChart", () => {
  it("draws scored solid and conceded dashed", () => {
    const series = renderChart().querySelectorAll("[data-part=series]");

    expect(series).toHaveLength(2);
    expect(series[0]?.hasAttribute("data-dashed")).toBe(false);
    expect(series[1]?.hasAttribute("data-dashed")).toBe(true);
  });

  it("puts each value on its own line", () => {
    // Scored 2.2 sits above conceded 0.6 at the first match; they swap at the
    // second.
    const container = renderChart();
    const [scoredFirst, scoredSecond] = seriesY(container, 0);
    const [concededFirst, concededSecond] = seriesY(container, 1);

    expect(scoredFirst).toBeLessThan(concededFirst ?? 0);
    expect(scoredSecond).toBeGreaterThan(concededSecond ?? 0);
  });

  it("starts the axis at 0 at the bottom and ends it at the top given", () => {
    const container = renderChart([{ match: 5, scored: 0, conceded: 5 }]);

    expect(seriesY(container, 0)).toEqual([BOTTOM]);
    expect(seriesY(container, 1)).toEqual([TOP]);
  });

  it("draws a value above the top at the edge, and says its true value", () => {
    const container = renderChart([{ match: 5, scored: 5.4, conceded: 1 }]);

    expect(seriesY(container, 0)).toEqual([TOP]);
    expect(screen.getByText(/tehdyt 5,4/)).toBeInTheDocument();
  });

  it("names both lines in the legend, in their styles", () => {
    renderChart();
    const legend = screen.getAllByRole("list")[0];
    if (legend === undefined) throw new Error("expected a legend");

    expect(SCORED_LABEL).toBe("Tehdyt maalit");
    expect(CONCEDED_LABEL).toBe("Päästetyt maalit");
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([SCORED_LABEL, CONCEDED_LABEL]);
  });

  it("lists every point as text, and the chart points at the list", () => {
    const container = renderChart();
    const list = container.querySelector("ol");

    expect([...(list?.querySelectorAll("li") ?? [])].map((item) => item.textContent)).toEqual([
      "Maalit 5. ottelun jälkeen: tehdyt 2,2, päästetyt 0,6 ottelua kohden.",
      "Maalit 6. ottelun jälkeen: tehdyt 1,4, päästetyt 1,8 ottelua kohden.",
    ]);
    expect(container.querySelector("svg[role=img]")?.getAttribute("aria-describedby")).toBe(
      list?.id
    );
  });

  it("draws nothing, but still renders, for an empty series", () => {
    // The panels never pass one — they show a message instead — but the chart
    // should not throw if it were given one, as the other charts do not.
    const container = renderChart([]);

    expect(container.querySelectorAll("[data-part=points] circle")).toHaveLength(0);
    expect(container.querySelector("[data-part=x-axis]")?.textContent).toContain("1");
  });

  it("runs the x-axis over the matches given", () => {
    const xAxis = renderChart().querySelector("[data-part=x-axis]")?.textContent ?? "";

    expect(xAxis).toContain("5");
    expect(xAxis).toContain("6");
    expect(xAxis).toContain("Ottelu");
  });
});
