import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  NO_ROUNDS_MESSAGE,
  POSITION_ERROR_MESSAGE,
  POSITION_HEADING,
  positionPanel,
  SPLIT_NOTE,
} from "@/components/league-position-section";
import type { PositionSeries } from "@/lib/position-series";

const series: PositionSeries = {
  status: "ok",
  points: [
    { round: 1, position: 7, played: true },
    { round: 2, position: 5, played: true },
  ],
  teamCount: 12,
  endsAtSplit: false,
};

function renderPanel(shown: PositionSeries = series) {
  return render(<div>{positionPanel(shown)}</div>).container;
}

// The sign-in gate is the Analyysit section's (analytics-section.test.tsx).
describe("positionPanel", () => {
  it("draws the chart under its own subheading, named by it", () => {
    const container = renderPanel();
    const heading = screen.getByRole("heading", { level: 4, name: POSITION_HEADING });

    expect(container.querySelector("svg")?.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(screen.getByRole("region", { name: POSITION_HEADING })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-part=points] circle")).toHaveLength(2);
  });

  it("scales the chart to the whole league", () => {
    expect(renderPanel().querySelector("[data-part=y-axis]")?.textContent).toContain("12");
  });

  it("says nothing about the split when the line did not stop at one", () => {
    renderPanel();

    expect(screen.queryByText(SPLIT_NOTE)).toBeNull();
  });

  it("says why the line stops, beneath it, when it ends at the split", () => {
    renderPanel({ ...series, endsAtSplit: true } as PositionSeries);

    expect(screen.getByText(SPLIT_NOTE)).toBeInTheDocument();
    expect(SPLIT_NOTE).toBe("Jatkosarjan sijoituksia ei voida laskea tälle kaudelle.");
  });

  it("says so when the season has no played round yet", () => {
    const container = renderPanel({ status: "no-rounds" });

    expect(screen.getByText(NO_ROUNDS_MESSAGE)).toBeInTheDocument();
    expect(NO_ROUNDS_MESSAGE).toBe("Kaudella ei ole vielä pelattuja kierroksia.");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("says so when the series cannot be computed", () => {
    renderPanel({ status: "error" });

    expect(screen.getByText(POSITION_ERROR_MESSAGE)).toBeInTheDocument();
    expect(POSITION_ERROR_MESSAGE).toBe("Sijoitusta ei voitu laskea. Yritä myöhemmin uudelleen.");
  });

  it("is no panel at all when the league season has no per-round table", () => {
    expect(positionPanel({ status: "unavailable" })).toBeNull();
  });
});
