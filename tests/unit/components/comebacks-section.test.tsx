import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  COMEBACKS_ERROR_MESSAGE,
  COMEBACKS_HEADING,
  comebacksPanel,
  DREW_LABEL,
  LED_DREW_LABEL,
  LED_LABEL,
  LED_LOST_LABEL,
  matchCount,
  missingText,
  NO_DEFICIT_MESSAGE,
  NO_HALF_TIME_MESSAGE,
  NO_LEAD_MESSAGE,
  TRAILED_LABEL,
  WON_LABEL,
} from "@/components/comebacks-section";
import type { ComebacksSeries } from "@/lib/comebacks";

const series: ComebacksSeries = {
  status: "ok",
  trailed: { matches: 5, won: 2, drew: 1, lost: 2 },
  led: { matches: 8, won: 5, drew: 2, lost: 1 },
  missing: 0,
  known: 22,
};
const NONE = { matches: 0, won: 0, drew: 0, lost: 0 };

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
  it("shows both directions under Kääntyneet ottelut, the deficit first", () => {
    const container = renderPanel();

    expect(screen.getByRole("heading", { level: 4, name: COMEBACKS_HEADING })).toBeInTheDocument();
    expect(COMEBACKS_HEADING).toBe("Kääntyneet ottelut");
    expect(figures(container)).toEqual([
      `${TRAILED_LABEL}5 ottelua`,
      `${WON_LABEL}2 ottelua`,
      `${DREW_LABEL}1 ottelu`,
      `${LED_LABEL}8 ottelua`,
      `${LED_DREW_LABEL}2 ottelua`,
      `${LED_LOST_LABEL}1 ottelu`,
    ]);
  });

  it("names the figures as the spec words them", () => {
    expect(TRAILED_LABEL).toBe("Tappioasemassa puoliajalla");
    expect(WON_LABEL).toBe("Käännetty voitoksi");
    expect(DREW_LABEL).toBe("Tasoitettu");
    expect(LED_LABEL).toBe("Johdossa puoliajalla");
    expect(LED_DREW_LABEL).toBe("Valunut tasapeliksi");
    expect(LED_LOST_LABEL).toBe("Käännetty tappioksi");
  });

  it("shows neither direction's third outcome, which is implied", () => {
    /**
     * The fixture has `trailed.lost` 2 and `led.won` 5, both deliberately
     * different from every figure shown, so a leak would be visible. Six
     * labels, and no row carrying either value.
     */
    const container = renderPanel();
    const labels = [...container.querySelectorAll("dl > div dt")].map((dt) => dt.textContent);

    expect(labels).toEqual([
      TRAILED_LABEL,
      WON_LABEL,
      DREW_LABEL,
      LED_LABEL,
      LED_DREW_LABEL,
      LED_LOST_LABEL,
    ]);
    expect(figures(container).filter((row) => row.endsWith("5 ottelua"))).toEqual([
      `${TRAILED_LABEL}5 ottelua`,
    ]);
  });

  it("says the team has not trailed yet, rather than showing three zeroes", () => {
    const container = renderPanel({ ...series, trailed: NONE });

    expect(screen.getByText(NO_DEFICIT_MESSAGE)).toBeInTheDocument();
    expect(NO_DEFICIT_MESSAGE).toBe("Ei vielä otteluita tappioasemasta.");
    // The other direction is untouched by its neighbour being empty.
    expect(figures(container)).toEqual([
      `${LED_LABEL}8 ottelua`,
      `${LED_DREW_LABEL}2 ottelua`,
      `${LED_LOST_LABEL}1 ottelu`,
    ]);
  });

  it("says the team has not led yet, and still shows the deficits", () => {
    const container = renderPanel({ ...series, led: NONE });

    expect(screen.getByText(NO_LEAD_MESSAGE)).toBeInTheDocument();
    expect(NO_LEAD_MESSAGE).toBe("Ei vielä otteluita johtoasemasta.");
    expect(figures(container)).toEqual([
      `${TRAILED_LABEL}5 ottelua`,
      `${WON_LABEL}2 ottelua`,
      `${DREW_LABEL}1 ottelu`,
    ]);
  });

  it("says both when every match was level at the break", () => {
    const container = renderPanel({ ...series, trailed: NONE, led: NONE, known: 4 });

    expect(screen.getByText(NO_DEFICIT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(NO_LEAD_MESSAGE)).toBeInTheDocument();
    expect(figures(container)).toEqual([]);
    // Not the season-wide message: these matches are known, just level.
    expect(screen.queryByText(NO_HALF_TIME_MESSAGE)).toBeNull();
  });

  it("still shows the figures when some matches have no half-time score", () => {
    const container = renderPanel({ ...series, missing: 2 });

    expect(figures(container)).toHaveLength(6);
    expect(screen.getByText("Puoliaikatulos puuttuu 2 ottelusta.")).toBeInTheDocument();
  });

  it("says how many are missing once, not once per direction", () => {
    renderPanel({ ...series, missing: 3 });

    // Two lines would read as two separate gaps (specs/037, Q1).
    expect(screen.getAllByText("Puoliaikatulos puuttuu 3 ottelusta.")).toHaveLength(1);
  });

  it("says how many are missing even when neither direction has a match", () => {
    renderPanel({ ...series, trailed: NONE, led: NONE, missing: 3, known: 2 });

    expect(screen.getByText(NO_DEFICIT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(NO_LEAD_MESSAGE)).toBeInTheDocument();
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
      trailed: NONE,
      led: NONE,
      missing: 30,
      known: 0,
    });

    expect(screen.getByText(NO_HALF_TIME_MESSAGE)).toBeInTheDocument();
    expect(NO_HALF_TIME_MESSAGE).toBe("Puoliaikatuloksia ei ole tälle kaudelle.");
    expect(figures(container)).toEqual([]);
    expect(screen.queryByText(NO_DEFICIT_MESSAGE)).toBeNull();
    expect(screen.queryByText(NO_LEAD_MESSAGE)).toBeNull();
    expect(screen.queryByText(/Puoliaikatulos puuttuu/)).toBeNull();
  });

  it("shows the error message instead of the figures", () => {
    const container = renderPanel({ status: "error" });

    expect(screen.getByRole("heading", { level: 4, name: COMEBACKS_HEADING })).toBeInTheDocument();
    expect(screen.getByText(COMEBACKS_ERROR_MESSAGE)).toBeInTheDocument();
    expect(COMEBACKS_ERROR_MESSAGE).toBe(
      "Kääntyneitä otteluita ei voitu laskea. Yritä myöhemmin uudelleen."
    );
    expect(figures(container)).toEqual([]);
  });

  it("shows no panel at all when the season has no league table", () => {
    const container = renderPanel({ status: "unavailable" });

    expect(container.textContent).toBe("");
  });
});
