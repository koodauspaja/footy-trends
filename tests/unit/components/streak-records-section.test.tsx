import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  NO_RECORDS_MESSAGE,
  RECORDS_ERROR_MESSAGE,
  RECORDS_HEADING,
  seasonSpanText,
  streakRecordsPanel,
} from "@/components/streak-records-section";
import {
  LONGEST_DEFEATS_LABEL,
  LONGEST_UNBEATEN_LABEL,
  LONGEST_WINS_LABEL,
} from "@/components/streaks-section";
import { HISTORY_AXIS, SEASON_AXIS } from "@/lib/analytics-axis";
import type { StreakRecords } from "@/lib/streak-records";

/**
 * The `Ennätykset` panel.
 *
 * decisions/039-streak-records.md
 * decisions/040-cup-analytics.md
 * decisions/041-national-team-analytics.md
 */

const none: StreakRecords = { wins: null, unbeaten: null, defeats: null, winless: null };

function ok(records: Partial<StreakRecords> = {}, scope = "Veikkausliiga") {
  return render(
    <div>
      {streakRecordsPanel({ status: "ok", records: { ...none, ...records }, scope }, SEASON_AXIS)}
    </div>
  ).container;
}

describe("seasonSpanText", () => {
  it("names the one season a record sits in", () => {
    expect(seasonSpanText({ length: 4, from: "2024", to: "2024" }, SEASON_AXIS)).toBe("Kausi 2024");
  });

  it("names both seasons a record crossed", () => {
    expect(seasonSpanText({ length: 6, from: "2024", to: "2025" }, SEASON_AXIS)).toBe(
      "Kaudet 2024–2025"
    );
  });

  it("keeps a foreign season's own wording", () => {
    expect(seasonSpanText({ length: 6, from: "2023/24", to: "2024/25" }, SEASON_AXIS)).toBe(
      "Kaudet 2023/24–2024/25"
    );
  });

  it("says vuosi on a page whose periods are calendar years (specs/041, S11)", () => {
    expect(seasonSpanText({ length: 4, from: "2019", to: "2019" }, HISTORY_AXIS)).toBe(
      "Vuosi 2019"
    );
    expect(seasonSpanText({ length: 9, from: "2019", to: "2020" }, HISTORY_AXIS)).toBe(
      "Vuodet 2019–2020"
    );
  });
});

describe("streakRecordsPanel", () => {
  it("is no panel at all when the club has no stored league season", () => {
    expect(streakRecordsPanel({ status: "unavailable" }, SEASON_AXIS)).toBeNull();
  });

  it("says so when the records cannot be computed", () => {
    render(<div>{streakRecordsPanel({ status: "error" }, SEASON_AXIS)}</div>);

    expect(screen.getByText(RECORDS_ERROR_MESSAGE)).toBeInTheDocument();
  });

  it("says so when the club has no record at all", () => {
    ok();

    expect(screen.getByRole("heading", { level: 4 })).toHaveTextContent(RECORDS_HEADING);
    expect(screen.getByText(NO_RECORDS_MESSAGE)).toBeInTheDocument();
  });

  it("names a record and when it was set", () => {
    ok({ wins: { length: 6, from: "2024", to: "2025" } });

    expect(screen.getByText(LONGEST_WINS_LABEL)).toBeInTheDocument();
    expect(screen.getByText(/6 voittoa/)).toBeInTheDocument();
    expect(screen.getByText("Kaudet 2024–2025")).toBeInTheDocument();
  });

  it("counts one of a thing the way Finnish does", () => {
    ok({ wins: { length: 1, from: "2024", to: "2024" } });

    expect(screen.getByText(/1 voitto(?!a)/)).toBeInTheDocument();
  });

  it("names the four runs in the same words as Putket", () => {
    ok({
      wins: { length: 3, from: "2024", to: "2024" },
      unbeaten: { length: 9, from: "2023", to: "2024" },
      defeats: { length: 2, from: "2022", to: "2022" },
    });

    expect(screen.getByText(LONGEST_WINS_LABEL)).toBeInTheDocument();
    expect(screen.getByText(LONGEST_UNBEATEN_LABEL)).toBeInTheDocument();
    expect(screen.getByText(LONGEST_DEFEATS_LABEL)).toBeInTheDocument();
    expect(screen.getByText(/9 ottelua ilman tappiota/)).toBeInTheDocument();
  });

  it("names the competition its records cover", () => {
    // The panel names its scope: on a club's cup page, its records would
    // otherwise read as the club's own.
    ok({ wins: { length: 3, from: "2024", to: "2024" } }, "Suomen Cup");

    expect(screen.getByText("Suomen Cup")).toBeInTheDocument();
  });

  it("names every competition when a club's history spans two", () => {
    ok({ wins: { length: 3, from: "2024", to: "2024" } }, "Veikkausliiga, Ykkönen");

    expect(screen.getByText("Veikkausliiga, Ykkönen")).toBeInTheDocument();
  });

  it("prints a span of years when that is what the records cover (specs/041, S12)", () => {
    // A national-team page's records cross every competition deliberately, so
    // the useful fact is how far back they reach.
    ok({ wins: { length: 4, from: "2019", to: "2019" } }, "2018–2026");

    expect(screen.getByText("2018–2026")).toBeInTheDocument();
  });

  it("says which single figure is missing, without hiding the others", () => {
    const container = ok({ wins: { length: 3, from: "2024", to: "2024" } });

    // Four figures either way; the three the club has never had say so.
    expect(container.querySelectorAll("dt")).toHaveLength(4);
    expect(screen.getAllByText(NO_RECORDS_MESSAGE)).toHaveLength(3);
  });
});
