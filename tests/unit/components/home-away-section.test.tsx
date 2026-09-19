import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NO_MATCHES_MESSAGE } from "@/components/goals-section";
import {
  HOME_AWAY_ERROR_MESSAGE,
  HOME_AWAY_HEADING,
  homeAwayPanel,
} from "@/components/home-away-section";
import type { HomeAwaySeries, SideStats } from "@/lib/home-away";

const side: SideStats = { matches: 2, won: 1, drawn: 1, lost: 0, scored: 3, conceded: 1 };
const none: SideStats = { matches: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0 };

function renderPanel(series: HomeAwaySeries) {
  return render(<div>{homeAwayPanel(series)}</div>).container;
}

// The sign-in gate is the Analyysit section's (analytics-section.test.tsx).
describe("homeAwayPanel", () => {
  it("draws the chart under its own subheading, named by it", () => {
    const container = renderPanel({ status: "ok", home: side, away: side });
    const heading = screen.getByRole("heading", { level: 3, name: HOME_AWAY_HEADING });

    expect(HOME_AWAY_HEADING).toBe("Koti- ja vierastilastot");
    expect(container.querySelector("svg[role=img]")?.getAttribute("aria-labelledby")).toBe(
      heading.id
    );
  });

  it("draws the chart with one side's matches only", () => {
    const container = renderPanel({ status: "ok", home: side, away: none });

    expect(container.querySelector("svg[role=img]")).not.toBeNull();
  });

  it("says so before the first match, and draws nothing", () => {
    const container = renderPanel({ status: "ok", home: none, away: none });

    expect(screen.getByText(NO_MATCHES_MESSAGE)).toBeInTheDocument();
    expect(container.querySelector("svg[role=img]")).toBeNull();
  });

  it("says so when the figures cannot be counted", () => {
    renderPanel({ status: "error" });

    expect(screen.getByText(HOME_AWAY_ERROR_MESSAGE)).toBeInTheDocument();
    expect(HOME_AWAY_ERROR_MESSAGE).toBe(
      "Koti- ja vierasotteluja ei voitu laskea. Yritä myöhemmin uudelleen."
    );
  });

  it("is no panel at all when the season has no league table", () => {
    expect(homeAwayPanel({ status: "unavailable" })).toBeNull();
  });
});
