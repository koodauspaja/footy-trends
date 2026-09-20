import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CURRENT_LABEL,
  currentText,
  LONGEST_DEFEATS_LABEL,
  LONGEST_UNBEATEN_LABEL,
  LONGEST_WINLESS_LABEL,
  LONGEST_WINS_LABEL,
  NO_STREAK_MESSAGE,
  STREAKS_ERROR_MESSAGE,
  STREAKS_HEADING,
  spanText,
  streaksPanel,
} from "@/components/streaks-section";
import type { StreaksSeries } from "@/lib/streaks";

const series: StreaksSeries = {
  status: "ok",
  current: { outcome: "win", length: 2 },
  longest: {
    wins: { length: 3, from: 12, to: 14 },
    unbeaten: { length: 15, from: 11, to: 25 },
    defeats: { length: 1, from: 8, to: 8 },
    winless: { length: 4, from: 8, to: 11 },
  },
};

function renderPanel(shown: StreaksSeries = series) {
  return render(<div>{streaksPanel(shown)}</div>).container;
}

function figures(container: HTMLElement) {
  return [...container.querySelectorAll("dl > div")].map((row) =>
    (row.textContent ?? "").replace(/\s+/g, " ")
  );
}

describe("currentText", () => {
  it("counts wins, defeats and draws by name", () => {
    expect(currentText({ outcome: "win", length: 3 })).toBe("3 voittoa");
    expect(currentText({ outcome: "defeat", length: 2 })).toBe("2 tappiota");
    expect(currentText({ outcome: "draw", length: 4 })).toBe("4 tasapeliä");
  });

  it("uses the singular for one match, as Finnish does", () => {
    expect(currentText({ outcome: "win", length: 1 })).toBe("1 voitto");
    expect(currentText({ outcome: "defeat", length: 1 })).toBe("1 tappio");
    expect(currentText({ outcome: "draw", length: 1 })).toBe("1 tasapeli");
  });
});

describe("spanText", () => {
  it("names the matches a run spans", () => {
    expect(spanText({ length: 5, from: 5, to: 9 })).toBe("Ottelut 5–9");
  });

  it("names one match in the singular", () => {
    expect(spanText({ length: 1, from: 8, to: 8 })).toBe("Ottelu 8");
  });
});

// The sign-in gate is the Analyysit section's (analytics-section.test.tsx).
describe("streaksPanel", () => {
  it("gives five figures under its own subheading", () => {
    const container = renderPanel();

    expect(STREAKS_HEADING).toBe("Putket");
    expect(screen.getByRole("heading", { level: 3, name: STREAKS_HEADING })).toBeInTheDocument();
    expect(figures(container)).toEqual([
      `${CURRENT_LABEL}2 voittoa`,
      `${LONGEST_WINS_LABEL}3 voittoa Ottelut 12–14`,
      `${LONGEST_UNBEATEN_LABEL}15 ottelua ilman tappiota Ottelut 11–25`,
      `${LONGEST_DEFEATS_LABEL}1 tappio Ottelu 8`,
      `${LONGEST_WINLESS_LABEL}4 ottelua ilman voittoa Ottelut 8–11`,
    ]);
  });

  it("draws no chart: a streak is a number", () => {
    expect(renderPanel().querySelector("svg")).toBeNull();
  });

  it("says so for a kind the season never had", () => {
    renderPanel({
      ...series,
      longest: { ...series.longest, defeats: null, winless: null },
    } as StreaksSeries);

    expect(screen.getAllByText(NO_STREAK_MESSAGE)).toHaveLength(2);
    expect(NO_STREAK_MESSAGE).toBe("Ei vielä putkea.");
  });

  it("says so for every figure before the first match", () => {
    const container = renderPanel({
      status: "ok",
      current: null,
      longest: { wins: null, unbeaten: null, defeats: null, winless: null },
    });

    expect(figures(container).every((row) => row.endsWith(NO_STREAK_MESSAGE))).toBe(true);
  });

  it("says so when the streaks cannot be counted", () => {
    renderPanel({ status: "error" });

    expect(screen.getByText(STREAKS_ERROR_MESSAGE)).toBeInTheDocument();
    expect(STREAKS_ERROR_MESSAGE).toBe("Putkia ei voitu laskea. Yritä myöhemmin uudelleen.");
  });

  it("is no panel at all when the season has no league table", () => {
    expect(streaksPanel({ status: "unavailable" })).toBeNull();
  });
});
