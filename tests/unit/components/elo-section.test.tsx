import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ELO_EMPTY_MESSAGE,
  ELO_ERROR_MESSAGE,
  ELO_HEADING,
  ELO_NOTE,
  eloAxis,
  eloPanel,
  eloSeasonSentence,
} from "@/components/elo-section";

/**
 * The Elo panel: its axis, its line and its explanation of 1500.
 *
 * decisions/053-elo-ratings.md
 */

const seasonLabel = (seasonId: number) => `${seasonId}/${String((seasonId + 1) % 100)}`;

function renderPanel(series: Parameters<typeof eloPanel>[0]["series"]) {
  const panel = eloPanel(series.status === "unavailable" ? { series } : { series, seasonLabel });
  return render(<div>{panel}</div>);
}

describe("eloAxis", () => {
  it("rounds out to whole fifties and ticks every 50 for a narrow span", () => {
    expect(eloAxis([1478, 1531])).toEqual({ domain: [1450, 1550], ticks: [1450, 1500, 1550] });
  });

  it("ticks every 100 once the span passes 300", () => {
    expect(eloAxis([1290, 1680])).toEqual({
      domain: [1250, 1700],
      ticks: [1300, 1400, 1500, 1600, 1700],
    });
  });

  it("keeps a single rating off the axis's edge", () => {
    expect(eloAxis([1500]).domain).toEqual([1450, 1550]);
  });
});

describe("eloSeasonSentence", () => {
  it("names the season and its rating, rounded", () => {
    expect(eloSeasonSentence("2025/26", 1563.6)).toBe("2025/26: 1564");
  });
});

describe("eloPanel", () => {
  const series = {
    status: "ok" as const,
    points: [
      { seasonId: 2024, rating: 1510.2 },
      { seasonId: 2024, rating: 1522.8 },
      { seasonId: 2025, rating: 1515.4 },
      { seasonId: 2025, rating: 1541.1 },
      { seasonId: 2025, rating: 1537 },
    ],
  };

  it("draws the rating after every match, a tick per season, as a bare line", () => {
    const { container } = renderPanel(series);

    expect(screen.getByRole("heading", { name: ELO_HEADING })).toBeInTheDocument();
    const line = container.querySelector("[data-part=line]");
    expect(line?.getAttribute("points")?.split(" ")).toHaveLength(5);
    // `dots: false`: hundreds of matches would otherwise be a row of dots.
    expect(container.querySelectorAll("[data-part=points] circle")).toHaveLength(0);
    expect(screen.getByText("2024/25")).toBeInTheDocument();
    expect(screen.getByText("2025/26")).toBeInTheDocument();
    expect(screen.getByText("Elo-luku")).toBeInTheDocument();
  });

  it("lists each season's last rating as text, and explains 1500", () => {
    renderPanel(series);

    const items = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(["2024/25: 1523", "2025/26: 1537"]);
    expect(screen.getByText(ELO_NOTE)).toBeInTheDocument();
  });

  it("says so for a team with no covered match", () => {
    renderPanel({ status: "empty" });

    expect(screen.getByText(ELO_EMPTY_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the failure line when the replay failed", () => {
    renderPanel({ status: "error" });

    expect(screen.getByText(ELO_ERROR_MESSAGE)).toBeInTheDocument();
  });

  it("is absent where there is no Elo, a national team's page", () => {
    expect(eloPanel({ series: { status: "unavailable" } })).toBeNull();
  });

  it("draws a team with a single match without dividing by zero", () => {
    const { container } = renderPanel({ status: "ok", points: [{ seasonId: 2025, rating: 1510 }] });

    expect(container.querySelector("[data-part=line]")?.getAttribute("points")).not.toMatch(/NaN/);
  });
});
