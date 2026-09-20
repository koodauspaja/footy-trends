import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  COMEBACKS_ERROR_MESSAGE,
  COMEBACKS_HEADING,
  comebacksPanel,
  DREW_LABEL,
  matchCount,
  missingText,
  NO_DEFICIT_MESSAGE,
  NO_HALF_TIME_MESSAGE,
  TRAILED_LABEL,
  WON_LABEL,
} from "@/components/comebacks-section";
import type { ComebacksSeries } from "@/lib/comebacks";

const series: ComebacksSeries = {
  status: "ok",
  trailed: 5,
  won: 2,
  drew: 1,
  missing: 0,
  known: 22,
};

function renderPanel(shown: ComebacksSeries = series) {
  return render(<div>{comebacksPanel(shown)}</div>).container;
}

function figures(container: HTMLElement) {
  return [...container.querySelectorAll("dl > div")].map((row) =>
    (row.textContent ?? "").replace(/\s+/g, " ")
  );
}

describe("matchCount", () => {
  it("uses the singular for one match, as Finnish does", () => {
    expect(matchCount(1)).toBe("1 ottelu");
  });

  it("uses the plural for every other count, zero included", () => {
    expect(matchCount(0)).toBe("0 ottelua");
    expect(matchCount(4)).toBe("4 ottelua");
  });
});

describe("missingText", () => {
  it("names how many matches have no half-time score", () => {
    expect(missingText(3)).toBe("Puoliaikatulos puuttuu 3 ottelusta.");
  });

  it("reads the same for one, because the elative does not change", () => {
    expect(missingText(1)).toBe("Puoliaikatulos puuttuu 1 ottelusta.");
  });
});

describe("comebacksPanel", () => {
  it("shows the three figures under Käännetyt ottelut", () => {
    const container = renderPanel();

    expect(screen.getByRole("heading", { level: 3, name: COMEBACKS_HEADING })).toBeInTheDocument();
    expect(COMEBACKS_HEADING).toBe("Käännetyt ottelut");
    expect(figures(container)).toEqual([
      `${TRAILED_LABEL}5 ottelua`,
      `${WON_LABEL}2 ottelua`,
      `${DREW_LABEL}1 ottelu`,
    ]);
  });

  it("names the figures as the spec words them", () => {
    expect(TRAILED_LABEL).toBe("Tappioasemassa puoliajalla");
    expect(WON_LABEL).toBe("Käännetty voitoksi");
    expect(DREW_LABEL).toBe("Tasoitettu");
  });

  it("says the team has not trailed yet, rather than showing three zeroes", () => {
    const container = renderPanel({ ...series, trailed: 0, won: 0, drew: 0 });

    expect(screen.getByText(NO_DEFICIT_MESSAGE)).toBeInTheDocument();
    expect(NO_DEFICIT_MESSAGE).toBe("Ei vielä otteluita tappioasemasta.");
    expect(figures(container)).toEqual([]);
  });

  it("still shows the figures when some matches have no half-time score (Q4)", () => {
    const container = renderPanel({ ...series, missing: 2 });

    expect(figures(container)).toEqual([
      `${TRAILED_LABEL}5 ottelua`,
      `${WON_LABEL}2 ottelua`,
      `${DREW_LABEL}1 ottelu`,
    ]);
    expect(screen.getByText("Puoliaikatulos puuttuu 2 ottelusta.")).toBeInTheDocument();
  });

  it("says how many are missing even when the team never trailed in the rest", () => {
    renderPanel({ ...series, trailed: 0, won: 0, drew: 0, missing: 3 });

    expect(screen.getByText(NO_DEFICIT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText("Puoliaikatulos puuttuu 3 ottelusta.")).toBeInTheDocument();
  });

  it("says nothing about missing matches when every one has a half-time score", () => {
    renderPanel();

    expect(screen.queryByText(/Puoliaikatulos puuttuu/)).toBeNull();
  });

  it("says the season has no half-time scores instead of showing zeroes", () => {
    // Zeroes would read as "never trailed", which is a claim the data does not
    // support: an old football-data season, or one not backfilled yet.
    const container = renderPanel({
      status: "ok",
      trailed: 0,
      won: 0,
      drew: 0,
      missing: 30,
      known: 0,
    });

    expect(screen.getByText(NO_HALF_TIME_MESSAGE)).toBeInTheDocument();
    expect(NO_HALF_TIME_MESSAGE).toBe("Puoliaikatuloksia ei ole tälle kaudelle.");
    expect(figures(container)).toEqual([]);
    expect(screen.queryByText(NO_DEFICIT_MESSAGE)).toBeNull();
    expect(screen.queryByText(/Puoliaikatulos puuttuu/)).toBeNull();
  });

  it("shows the error message instead of the figures", () => {
    const container = renderPanel({ status: "error" });

    expect(screen.getByRole("heading", { level: 3, name: COMEBACKS_HEADING })).toBeInTheDocument();
    expect(screen.getByText(COMEBACKS_ERROR_MESSAGE)).toBeInTheDocument();
    expect(COMEBACKS_ERROR_MESSAGE).toBe(
      "Käännettyjä otteluita ei voitu laskea. Yritä myöhemmin uudelleen."
    );
    expect(figures(container)).toEqual([]);
  });

  it("shows no panel at all when the season has no league table", () => {
    const container = renderPanel({ status: "unavailable" });

    expect(container.textContent).toBe("");
  });
});
