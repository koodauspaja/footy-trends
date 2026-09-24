import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  GOALS_ERROR_MESSAGE,
  NO_MATCHES_MESSAGE,
  ROLLING_HEADING,
  ROLLING_TOO_FEW_MESSAGE,
  rollingGoalsPanel,
  TOTALS_HEADING,
  totalGoalsPanel,
} from "@/components/goals-section";
import type { GoalsSeries } from "@/lib/goals-series";

const series: GoalsSeries = {
  status: "ok",
  rolling: [{ match: 5, scored: 1.4, conceded: 0.8 }],
  totals: [
    { match: 1, scored: 2, conceded: 0 },
    { match: 2, scored: 3, conceded: 1 },
    { match: 3, scored: 3, conceded: 4 },
    { match: 4, scored: 7, conceded: 5 },
    { match: 5, scored: 9, conceded: 7 },
  ],
};

function renderPanels(shown: GoalsSeries = series) {
  return render(
    <div>
      {rollingGoalsPanel(shown)}
      {totalGoalsPanel(shown)}
    </div>
  ).container;
}

// The sign-in gate is the Analyysit section's (analytics-section.test.tsx).
describe("the goals panels", () => {
  it("draw each chart under its own subheading, named by it", () => {
    renderPanels();

    expect(ROLLING_HEADING).toBe("Maalit otteluittain");
    expect(TOTALS_HEADING).toBe("Maalit yhteensä");
    for (const name of [ROLLING_HEADING, TOTALS_HEADING]) {
      const heading = screen.getByRole("heading", { level: 4, name });
      const region = screen.getByRole("region", { name });
      expect(region.querySelector("svg")?.getAttribute("aria-labelledby")).toBe(heading.id);
    }
  });

  it("label each y-axis, and give the rolling chart the fixed 0–5", () => {
    renderPanels();
    const rollingAxis = screen
      .getByRole("region", { name: ROLLING_HEADING })
      .querySelector("[data-part=y-axis]")?.textContent;
    const totalsAxis = screen
      .getByRole("region", { name: TOTALS_HEADING })
      .querySelector("[data-part=y-axis]")?.textContent;

    expect(rollingAxis).toBe("012345Maaleja / ottelu");
    // The highest total is 9, rounded up to a ten.
    expect(totalsAxis).toBe("010Maaleja");
  });

  it("show the rolling message before the fifth match, and the totals still", () => {
    const container = renderPanels({ ...series, rolling: [] } as GoalsSeries);

    expect(screen.getByText(ROLLING_TOO_FEW_MESSAGE)).toBeInTheDocument();
    expect(ROLLING_TOO_FEW_MESSAGE).toBe(
      "Maalit näytetään, kun joukkue on pelannut vähintään viisi ottelua."
    );
    expect(container.querySelectorAll("svg[role=img]")).toHaveLength(1);
  });

  it("show both messages before the first match", () => {
    const container = renderPanels({ status: "ok", rolling: [], totals: [] });

    expect(screen.getByText(ROLLING_TOO_FEW_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(NO_MATCHES_MESSAGE)).toBeInTheDocument();
    expect(NO_MATCHES_MESSAGE).toBe("Kaudella ei ole vielä pelattuja otteluita.");
    expect(container.querySelector("svg[role=img]")).toBeNull();
  });

  it("show the error in both when the goals cannot be counted", () => {
    renderPanels({ status: "error" });

    expect(screen.getAllByText(GOALS_ERROR_MESSAGE)).toHaveLength(2);
    expect(GOALS_ERROR_MESSAGE).toBe("Maaleja ei voitu laskea. Yritä myöhemmin uudelleen.");
  });

  it("are no panels at all when the season has no league table", () => {
    expect(rollingGoalsPanel({ status: "unavailable" })).toBeNull();
    expect(totalGoalsPanel({ status: "unavailable" })).toBeNull();
  });
});
