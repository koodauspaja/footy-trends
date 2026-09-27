import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  FORM_ERROR_MESSAGE,
  FORM_HEADING,
  formPanel,
  TOO_FEW_MESSAGE,
} from "@/components/form-section";
import type { FormSeries } from "@/lib/form-series";

const series: FormSeries = {
  status: "ok",
  points: [
    { match: 5, form: 2.2 },
    { match: 6, form: 1.4 },
    { match: 7, form: 1.8 },
  ],
};

function renderPanel(shown: FormSeries = series) {
  return render(<div>{formPanel(shown)}</div>).container;
}

// The sign-in gate is the Analyysit section's (analytics-section.test.tsx).
describe("formPanel", () => {
  it("draws the chart under its own subheading, named by it", () => {
    const container = renderPanel();
    const heading = screen.getByRole("heading", { level: 4, name: FORM_HEADING });

    expect(FORM_HEADING).toBe("Vire otteluittain");
    expect(container.querySelector("svg")?.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(screen.getByRole("region", { name: FORM_HEADING })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-part=points] circle")).toHaveLength(3);
  });

  it("says when there are not five matches yet, and draws nothing", () => {
    const container = renderPanel({ status: "too-few" });

    expect(screen.getByText(TOO_FEW_MESSAGE)).toBeInTheDocument();
    expect(TOO_FEW_MESSAGE).toBe(
      "Vire näytetään, kun joukkue on pelannut vähintään viisi ottelua."
    );
    expect(container.querySelector("svg")).toBeNull();
  });

  it("says so when the form cannot be computed", () => {
    renderPanel({ status: "error" });

    expect(screen.getByText(FORM_ERROR_MESSAGE)).toBeInTheDocument();
    expect(FORM_ERROR_MESSAGE).toBe("Virettä ei voitu laskea. Yritä myöhemmin uudelleen.");
  });

  it("is no panel at all when the season has no league table", () => {
    expect(formPanel({ status: "unavailable" })).toBeNull();
  });
});
