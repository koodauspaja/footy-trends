import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormChart, formatForm, formSentence } from "@/components/charts/form-chart";
import { CHART, MARGIN } from "@/components/charts/line-chart";
import type { FormPoint } from "@/lib/form-series";

const TOP = MARGIN.top;
const BOTTOM = CHART.height - MARGIN.bottom;

const points: FormPoint[] = [
  { match: 5, form: 3 },
  { match: 6, form: 0 },
  { match: 7, form: 1.4 },
];

function renderChart(shown: readonly FormPoint[] = points) {
  return render(<FormChart headingId="form" points={shown} title="Vire otteluittain" />).container;
}

function yOf(container: HTMLElement, index: number): number {
  return Number(container.querySelectorAll("[data-part=points] circle")[index]?.getAttribute("cy"));
}

describe("formatForm", () => {
  it("writes one decimal with a comma, as Finnish does", () => {
    expect(formatForm(2.2)).toBe("2,2");
    expect(formatForm(3)).toBe("3,0");
    expect(formatForm(0)).toBe("0,0");
  });

  it("prints a fifth exactly, whatever floating point makes of it", () => {
    // 0.2 × 3 is 0.6000000000000001 in floating point.
    expect(formatForm(0.2 * 3)).toBe("0,6");
  });
});

describe("formSentence", () => {
  it("says the match and the form, as the spec words it", () => {
    expect(formSentence({ match: 12, form: 2.2 })).toBe(
      "Vire 12. ottelun jälkeen: 2,2 pistettä ottelua kohden."
    );
  });
});

describe("FormChart", () => {
  it("draws 3 at the top and 0 at the bottom — more points is higher", () => {
    const container = renderChart();

    expect(yOf(container, 0)).toBe(TOP);
    expect(yOf(container, 1)).toBe(BOTTOM);
  });

  it("spans 0 to 3 on the y-axis whatever the team's form", () => {
    // Never above 1.4 here: the axis still reaches 3, so a poor run looks poor.
    const container = renderChart([
      { match: 5, form: 1.4 },
      { match: 6, form: 0.6 },
    ]);
    const yAxis = container.querySelector("[data-part=y-axis]")?.textContent ?? "";

    expect(yAxis).toContain("0123");
    expect(yOf(container, 0)).toBeGreaterThan(TOP);
  });

  it("runs the x-axis over the team's matches, from the fifth", () => {
    const xAxis = renderChart().querySelector("[data-part=x-axis]")?.textContent ?? "";

    expect(xAxis.startsWith("5")).toBe(true);
    expect(xAxis).toContain("7");
  });

  it("labels its axes in Finnish", () => {
    const container = renderChart();

    expect(container.querySelector("[data-part=x-axis]")?.textContent).toContain("Ottelu");
    expect(container.querySelector("[data-part=y-axis]")?.textContent).toContain(
      "Pisteitä / ottelu"
    );
  });

  it("lists every point as text, and the chart points at the list", () => {
    const container = renderChart();
    const list = screen.getByRole("list");

    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([
      "Vire 5. ottelun jälkeen: 3,0 pistettä ottelua kohden.",
      "Vire 6. ottelun jälkeen: 0,0 pistettä ottelua kohden.",
      "Vire 7. ottelun jälkeen: 1,4 pistettä ottelua kohden.",
    ]);
    expect(container.querySelector("svg")?.getAttribute("aria-describedby")).toBe(list.id);
    expect(container.querySelector("svg")?.getAttribute("aria-labelledby")).toBe("form");
  });

  it("draws a single point without dividing by zero", () => {
    const container = renderChart([{ match: 5, form: 2 }]);
    const cx = Number(container.querySelector("[data-part=points] circle")?.getAttribute("cx"));

    expect(Number.isFinite(cx)).toBe(true);
  });

  it("draws nothing, but still renders, for an empty series", () => {
    expect(renderChart([]).querySelectorAll("[data-part=points] circle")).toHaveLength(0);
  });
});
