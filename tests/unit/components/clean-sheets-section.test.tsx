import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CLEAN_SHEETS_ERROR_MESSAGE,
  CLEAN_SHEETS_HEADING,
  cleanSheetsPanel,
} from "@/components/clean-sheets-section";
import { NO_MATCHES_MESSAGE } from "@/components/goals-section";
import type { CleanSheetSeries } from "@/lib/clean-sheets";

const series: CleanSheetSeries = {
  status: "ok",
  points: [
    { match: 1, kept: 1, share: 100 },
    { match: 2, kept: 1, share: 50 },
  ],
};

function renderPanel(shown: CleanSheetSeries = series) {
  return render(<div>{cleanSheetsPanel(shown)}</div>).container;
}

// The sign-in gate is the Analyysit section's (analytics-section.test.tsx).
describe("cleanSheetsPanel", () => {
  it("draws the chart under its own subheading, named by it", () => {
    const container = renderPanel();
    const heading = screen.getByRole("heading", { level: 3, name: CLEAN_SHEETS_HEADING });

    expect(CLEAN_SHEETS_HEADING).toBe("Nollapelit");
    expect(container.querySelector("svg")?.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(container.querySelectorAll("[data-part=points] circle")).toHaveLength(2);
  });

  it("says so before the first match, and draws nothing", () => {
    const container = renderPanel({ status: "ok", points: [] });

    expect(screen.getByText(NO_MATCHES_MESSAGE)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("says so when the share cannot be counted", () => {
    renderPanel({ status: "error" });

    expect(screen.getByText(CLEAN_SHEETS_ERROR_MESSAGE)).toBeInTheDocument();
    expect(CLEAN_SHEETS_ERROR_MESSAGE).toBe(
      "Nollapelejä ei voitu laskea. Yritä myöhemmin uudelleen."
    );
  });

  it("is no panel at all when the season has no league table", () => {
    expect(cleanSheetsPanel({ status: "unavailable" })).toBeNull();
  });
});
