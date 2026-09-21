import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TRACK } from "@/components/charts/bar-chart";
import {
  HomeAwayChart,
  homeAwaySentence,
  MEASURES,
  measureText,
} from "@/components/charts/home-away-chart";
import { percentText } from "@/components/charts/line-chart";
import type { SideStats } from "@/lib/home-away";

/** Arsenal 2024/25: 39 points at home in 19 matches, 35 away. */
const home: SideStats = { matches: 19, won: 11, drawn: 6, lost: 2, scored: 35, conceded: 17 };
const away: SideStats = { matches: 19, won: 9, drawn: 8, lost: 2, scored: 34, conceded: 17 };

function renderChart(homeSide = home, awaySide = away) {
  return render(
    <HomeAwayChart
      away={awaySide}
      headingId="home-away"
      home={homeSide}
      title="Koti- ja vierastilastot"
    />
  ).container;
}

describe("the measures", () => {
  it("are the four agreed, each on its fixed scale", () => {
    expect(MEASURES.map((measure) => [measure.label, measure.max])).toEqual([
      ["Pisteitä / ottelu", 3],
      ["Tehdyt maalit / ottelu", 4],
      ["Päästetyt maalit / ottelu", 4],
      ["Voittoprosentti", 100],
    ]);
  });
});

describe("the numbers", () => {
  it("prints a dash, not a zero, for a side with no match", () => {
    expect(measureText(null, percentText)).toBe("–");
    expect(measureText(0, percentText)).toBe("0 %");
  });

  it("words a text row as the spec does", () => {
    expect(homeAwaySentence("Pisteitä / ottelu", "2,05", "1,84")).toBe(
      "Pisteitä / ottelu: kotona 2,05, vieraissa 1,84."
    );
  });
});

describe("HomeAwayChart", () => {
  it("prints both sides' values, per match with two decimals", () => {
    const values = [...renderChart().querySelectorAll("[data-part=value]")].map(
      (v) => v.textContent
    );

    expect(values).toEqual(["2,05", "1,84", "1,84", "1,79", "0,89", "0,89", "58 %", "47 %"]);
  });

  it("fills home and outlines away", () => {
    const bars = [
      ...(renderChart()
        .querySelectorAll("[data-part=row]")[0]
        ?.querySelectorAll("[data-part=fill]") ?? []),
    ];

    expect(bars.map((bar) => bar.hasAttribute("data-outlined"))).toEqual([false, true]);
  });

  it("draws points on their 0–3 scale", () => {
    const first = renderChart().querySelector("[data-part=fill]");

    expect(Number(first?.getAttribute("width"))).toBeCloseTo((39 / 19 / 3) * TRACK);
  });

  it("names both sides with their match counts in the legend", () => {
    const container = renderChart();
    const legend = [...container.querySelectorAll("ul li")].map((item) => item.textContent);

    expect(legend).toEqual(["Kotona (19 ottelua)", "Vieraissa (19 ottelua)"]);
  });

  it("lists every measure as text, and the chart points at the list", () => {
    const container = renderChart();
    const list = container.querySelector("ol");

    expect([...(list?.querySelectorAll("li") ?? [])].map((item) => item.textContent)).toEqual([
      "Pisteitä / ottelu: kotona 2,05, vieraissa 1,84.",
      "Tehdyt maalit / ottelu: kotona 1,84, vieraissa 1,79.",
      "Päästetyt maalit / ottelu: kotona 0,89, vieraissa 0,89.",
      "Voittoprosentti: kotona 58 %, vieraissa 47 %.",
    ]);
    expect(container.querySelector("svg[role=img]")?.getAttribute("aria-describedby")).toBe(
      list?.id
    );
  });

  it("draws no away bars before the first away match, and says so with dashes", () => {
    const none: SideStats = { matches: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0 };
    const container = renderChart(home, none);

    expect(container.querySelectorAll("[data-part=fill][data-outlined]")).toHaveLength(0);
    expect(screen.getByText("Vieraissa (0 ottelua)")).toBeInTheDocument();
    expect(screen.getByText("Pisteitä / ottelu: kotona 2,05, vieraissa –.")).toBeInTheDocument();
  });
});
