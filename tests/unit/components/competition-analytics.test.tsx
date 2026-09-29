import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoalsPerGameSeries } from "@/lib/goals-per-game";
import type { OutcomeRow, OutcomeShares } from "@/lib/outcome-shares";

const { canSeeAnalytics, getGoalsPerGame, getOutcomeShares } = vi.hoisted(() => ({
  canSeeAnalytics: vi.fn<() => Promise<boolean>>(),
  getGoalsPerGame: vi.fn<() => Promise<GoalsPerGameSeries>>(),
  getOutcomeShares: vi.fn<() => Promise<OutcomeShares>>(),
}));

vi.mock("@/lib/analytics-access", () => ({ canSeeAnalytics }));
vi.mock("@/lib/match-service", () => ({ getGoalsPerGame, getOutcomeShares }));
// The prompt's sign-in flow is sign-in-prompt.test.tsx's; here it only has to
// show which message it was given.
vi.mock("@/components/sign-in-prompt", () => ({
  SignInPrompt: ({ message }: { message: string }) => <p>{message}</p>,
}));

import { ANALYTICS_HEADING, SIGNED_OUT_MESSAGE } from "@/components/analytics-section";
import {
  advantageText,
  CompetitionAnalyticsSection,
  GOALS_PER_GAME_ERROR_MESSAGE,
  GOALS_PER_GAME_HEADING,
  HOME_ADVANTAGE_ERROR_MESSAGE,
  HOME_ADVANTAGE_HEADING,
  IN_PROGRESS_NOTE,
  leftOutSentence,
  NO_OWN_MATCHES_MESSAGE,
  ROUNDING_NOTE,
  SEASON_BY_SEASON_HEADING,
  SIDE_BY_SIDE_HEADING,
  STORED_SEASONS_NOTE,
  seasonSentence,
  TOO_FEW_SEASONS_MESSAGE,
  windowSentence,
} from "@/components/competition-analytics";

const inProgress = { seasonId: 2025, matches: 60, perGame: 3.1, inProgress: true };
const series: GoalsPerGameSeries = {
  status: "ok",
  points: [
    { seasonId: 2023, matches: 380, perGame: 2.75, inProgress: false },
    { seasonId: 2024, matches: 380, perGame: 2.8, inProgress: false },
    inProgress,
  ],
  yDomain: [2.5, 3.5],
  yTicks: [2.5, 3, 3.5],
  leftOut: [2022],
};

function outcomeRow(overrides: Partial<OutcomeRow> = {}): OutcomeRow {
  return {
    kind: "football-data",
    code: "PL",
    name: "Valioliiga",
    matches: 1140,
    homeShare: 43.4,
    drawShare: 24.6,
    awayShare: 32,
    advantage: 11.4,
    ...overrides,
  };
}

const shares: OutcomeShares = {
  status: "ok",
  rows: [
    outcomeRow(),
    outcomeRow({
      kind: "taso",
      code: "VL",
      name: "Veikkausliiga",
      matches: 594,
      homeShare: 39.6,
      drawShare: 26.1,
      awayShare: 34.3,
      advantage: 5.3,
    }),
  ],
  calendarYears: { first: 2023, last: 2025 },
  spanningYears: { first: 2023, last: 2025 },
};

const seasonLabel = (season: number) => `${season}/${String(season + 1).slice(2)}`;

async function renderSection({
  kind = "football-data",
  competitionCode = "PL",
  selectedSeasonId = 2024,
}: Partial<{
  kind: "football-data" | "taso";
  competitionCode: string;
  selectedSeasonId: number;
}> = {}) {
  const view = await CompetitionAnalyticsSection({
    kind,
    competitionCode,
    selectedSeasonId,
    activeSeasonId: 2025,
    seasonLabel,
  });
  return { view, ...render(<div>{view}</div>) };
}

beforeEach(() => {
  canSeeAnalytics.mockReset();
  getGoalsPerGame.mockReset();
  getOutcomeShares.mockReset();
  canSeeAnalytics.mockResolvedValue(true);
  getGoalsPerGame.mockResolvedValue(series);
  getOutcomeShares.mockResolvedValue(shares);
});

describe("the strings the spec agreed", () => {
  it("names the group and the panel, and says what a season is and why one is missing", () => {
    expect(SEASON_BY_SEASON_HEADING).toBe("Kausi kaudelta");
    expect(GOALS_PER_GAME_HEADING).toBe("Maaleja ottelua kohden");
    expect(STORED_SEASONS_NOTE).toBe("Perustuu tallennettuihin kausiin.");
    expect(leftOutSentence("2026")).toBe(
      "Kausi 2026 näytetään, kun siitä on pelattu vähintään viisi ottelua."
    );
    expect(seasonSentence(inProgress, "2025/26")).toBe(
      "Kausi 2025/26 (kesken): 3,1 maalia ottelua kohden, 60 ottelua."
    );
    expect(
      seasonSentence({ seasonId: 2024, matches: 132, perGame: 2.8, inProgress: false }, "2024")
    ).toBe("Kausi 2024: 2,8 maalia ottelua kohden, 132 ottelua.");
  });
});

describe("CompetitionAnalyticsSection, signed in", () => {
  it("puts the panel under Analyysit and Kausi kaudelta, in that order", async () => {
    await renderSection();

    const headings = screen
      .getAllByRole("heading")
      .map((heading) => [heading.tagName, heading.textContent]);
    expect(headings).toEqual([
      ["H2", ANALYTICS_HEADING],
      ["H3", SEASON_BY_SEASON_HEADING],
      ["H4", GOALS_PER_GAME_HEADING],
      ["H3", SIDE_BY_SIDE_HEADING],
      ["H4", HOME_ADVANTAGE_HEADING],
    ]);
  });

  it("asks for the competition's own seasons, with the season in progress", async () => {
    await renderSection({ kind: "taso", competitionCode: "VL" });

    expect(getGoalsPerGame).toHaveBeenCalledWith("taso", "VL", 2025);
  });

  it("draws one point per season, the page's own season ringed (S11)", async () => {
    const { container } = await renderSection();
    const points = container.querySelectorAll("[data-part=points] circle:not([data-marked])");
    const rings = container.querySelectorAll("[data-marked]");

    expect(points).toHaveLength(3);
    expect(rings).toHaveLength(1);
    expect(rings[0]?.getAttribute("cx")).toBe(points[1]?.getAttribute("cx"));
  });

  it("rings nothing when the page shows a season the line does not draw", async () => {
    const { container } = await renderSection({ selectedSeasonId: 2022 });

    expect(container.querySelector("[data-marked]")).toBeNull();
  });

  it("labels seasons as the page does, and notes the one in progress under its tick (S15)", async () => {
    const { container } = await renderSection();
    const ticks = [...container.querySelectorAll("[data-part=x-axis] text")].slice(0, -1);
    const notes = container.querySelectorAll("[data-part=tick-note]");

    expect(ticks.map((tick) => tick.firstChild?.textContent)).toEqual([
      "2023/24",
      "2024/25",
      "2025/26",
    ]);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.textContent).toBe(IN_PROGRESS_NOTE);
    expect(notes[0]?.parentElement).toBe(ticks[2]);
  });

  it("labels every other season on a phone when a long line would crowd them (S16)", async () => {
    getGoalsPerGame.mockResolvedValue({
      ...series,
      points: Array.from({ length: 12 }, (_, index) => ({
        seasonId: 2015 + index,
        matches: 132,
        perGame: 2.8,
        inProgress: index === 11,
      })),
      leftOut: [],
    });
    const { container } = await renderSection({ kind: "taso", competitionCode: "VL" });
    const hidden = container.querySelectorAll("[data-part=x-axis] text.max-sm\\:hidden");

    expect(hidden).toHaveLength(6);
  });

  it("prints the y-axis the Finnish way, from the series' own zoom (S13)", async () => {
    const { container } = await renderSection();
    const ticks = [...container.querySelectorAll("[data-part=y-axis] text")].slice(0, -1);

    expect(ticks.map((tick) => tick.textContent)).toEqual(["2,5", "3,0", "3,5"]);
  });

  it("gives the chart a text alternative, one sentence per season", async () => {
    await renderSection();
    const chart = screen.getByRole("img");
    const text = screen.getByRole("list");

    expect(chart).toHaveAccessibleName(GOALS_PER_GAME_HEADING);
    expect(chart.getAttribute("aria-describedby")).toBe(text.id);
    expect(
      within(text)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual([
      "Kausi 2023/24: 2,8 maalia ottelua kohden, 380 ottelua.",
      "Kausi 2024/25: 2,8 maalia ottelua kohden, 380 ottelua.",
      "Kausi 2025/26 (kesken): 3,1 maalia ottelua kohden, 60 ottelua.",
    ]);
  });

  it("names each season left out, then says the line is the stored seasons (S9, S14)", async () => {
    await renderSection();

    expect(screen.getByText(leftOutSentence("2022/23"))).toBeInTheDocument();
    expect(screen.getByText(STORED_SEASONS_NOTE)).toBeInTheDocument();
  });

  it.each([
    ["too few seasons", { status: "too-few" }, TOO_FEW_SEASONS_MESSAGE],
    ["a failed read", { status: "error" }, GOALS_PER_GAME_ERROR_MESSAGE],
  ] as const)(
    "says so for %s, under the same headings and without a chart",
    async (_name, result, message) => {
      getGoalsPerGame.mockResolvedValue(result);
      const { container } = await renderSection();

      expect(screen.getByText(message)).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 4, name: GOALS_PER_GAME_HEADING })
      ).toBeInTheDocument();
      expect(container.querySelector("svg")).toBeNull();
      expect(screen.queryByText(STORED_SEASONS_NOTE)).toBeNull();
    }
  );
});

describe("CompetitionAnalyticsSection, signed out (S4)", () => {
  beforeEach(() => {
    canSeeAnalytics.mockResolvedValue(false);
  });

  it("shows one prompt under Analyysit and reads nothing, so no value reaches the page", async () => {
    const { container } = await renderSection();

    expect(screen.getByRole("heading", { level: 2, name: ANALYTICS_HEADING })).toBeInTheDocument();
    expect(screen.getAllByText(SIGNED_OUT_MESSAGE)).toHaveLength(1);
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("table")).toBeNull();
    expect(getGoalsPerGame).not.toHaveBeenCalled();
    expect(getOutcomeShares).not.toHaveBeenCalled();
  });
});

describe("CompetitionAnalyticsSection where the spec has none (S5)", () => {
  it.each([
    ["football-data", "WC"],
    ["football-data", "EC"],
    ["taso", "MSC"],
    ["taso", "LC"],
  ] as const)(
    "renders nothing on %s %s, and asks neither the gate nor the data",
    async (kind, code) => {
      const { view } = await renderSection({ kind, competitionCode: code });

      expect(view).toBeNull();
      expect(canSeeAnalytics).not.toHaveBeenCalled();
      expect(getGoalsPerGame).not.toHaveBeenCalled();
      expect(getOutcomeShares).not.toHaveBeenCalled();
    }
  );
});

describe("the home-advantage strings (specs/049)", () => {
  it("prints Kotietu signed, with a real minus and a bare zero (S5)", () => {
    expect(advantageText(15.6)).toBe("+16");
    expect(advantageText(-2.6)).toBe("−3");
    expect(advantageText(0.4)).toBe("0");
    expect(advantageText(-0.4)).toBe("0");
  });

  it("names the seasons of both kinds, one kind, a single season, or nothing (S18)", () => {
    expect(windowSentence({ first: 2023, last: 2025 }, { first: 2023, last: 2025 })).toBe(
      "Kaudet 2023–2025 ja 2023/24–2025/26, kaikki tallennetut ottelut."
    );
    expect(windowSentence(null, { first: 2024, last: 2025 })).toBe(
      "Kaudet 2024/25–2025/26, kaikki tallennetut ottelut."
    );
    expect(windowSentence({ first: 2025, last: 2025 }, null)).toBe(
      "Kaudet 2025, kaikki tallennetut ottelut."
    );
    expect(windowSentence(null, null)).toBeNull();
  });

  it("uses the agreed Finnish for the panel's other lines", () => {
    expect(SIDE_BY_SIDE_HEADING).toBe("Kilpailut rinnakkain");
    expect(HOME_ADVANTAGE_HEADING).toBe("Kotietu ja tasapelit");
    expect(HOME_ADVANTAGE_ERROR_MESSAGE).toBe(
      "Kotietua ei voitu laskea. Yritä myöhemmin uudelleen."
    );
    expect(NO_OWN_MATCHES_MESSAGE).toBe(
      "Kilpailusta ei ole tallennettuja otteluita näiltä kausilta."
    );
    expect(ROUNDING_NOTE).toBe(
      "Osuudet on pyöristetty, joten niiden summa voi poiketa 100 prosentista."
    );
  });
});

describe("Kotietu ja tasapelit", () => {
  function panel() {
    return within(screen.getByRole("region", { name: HOME_ADVANTAGE_HEADING }));
  }

  it("lists every competition in the given order, shares as whole percentages (S4, S14)", async () => {
    await renderSection();

    const rows = panel()
      .getAllByRole("row")
      .map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent));
    expect(rows).toEqual([
      ["Kilpailu", "Ottelut", "Kotivoitot", "Tasapelit", "Vierasvoitot", "Kotietu"],
      ["Valioliiga", "1140", "43 %", "25 %", "32 %", "+11"],
      ["Veikkausliiga", "594", "40 %", "26 %", "34 %", "+5"],
    ]);
  });

  it("marks this page's own competition, matched by provider as well as code", async () => {
    await renderSection({ kind: "taso", competitionCode: "VL" });

    const current = panel()
      .getAllByRole("row")
      .filter((row) => row.getAttribute("aria-current") === "true");
    expect(current.map((row) => row.querySelector("th")?.textContent)).toEqual(["Veikkausliiga"]);
    expect(panel().queryByText(NO_OWN_MATCHES_MESSAGE)).toBeNull();
  });

  it("does not mark a same-coded competition of the other provider", async () => {
    // No such pair exists today; the two registries are free to make one.
    getOutcomeShares.mockResolvedValue({
      ...shares,
      rows: [outcomeRow({ kind: "taso", code: "CL", name: "TASO CL" })],
    });
    await renderSection({ kind: "football-data", competitionCode: "CL" });

    expect(panel().getByText(NO_OWN_MATCHES_MESSAGE)).toBeInTheDocument();
  });

  it("names the seasons, then says the shares are rounded (S14, S18)", async () => {
    await renderSection();

    const lines = panel()
      .getAllByText(/^(Kaudet|Osuudet)/)
      .map((line) => line.textContent);
    expect(lines).toEqual([
      "Kaudet 2023–2025 ja 2023/24–2025/26, kaikki tallennetut ottelut.",
      ROUNDING_NOTE,
    ]);
  });

  it("still compares the others without a row of its own, and says why (S16)", async () => {
    await renderSection({ kind: "taso", competitionCode: "M1L" });

    expect(panel().getByText(NO_OWN_MATCHES_MESSAGE)).toBeInTheDocument();
    expect(panel().getAllByRole("row")).toHaveLength(3);
    expect(
      panel()
        .getAllByRole("row")
        .filter((row) => row.hasAttribute("aria-current"))
    ).toEqual([]);
  });

  it("names no seasons when nothing at all is in the window", async () => {
    getOutcomeShares.mockResolvedValue({
      status: "ok",
      rows: [],
      calendarYears: null,
      spanningYears: null,
    });
    await renderSection();

    expect(panel().queryByText(/^Kaudet/)).toBeNull();
    expect(panel().getByText(ROUNDING_NOTE)).toBeInTheDocument();
  });

  it("shows one failure message in place of the table, and keeps goals per game (S15)", async () => {
    getOutcomeShares.mockResolvedValue({ status: "error" });
    const { container } = await renderSection();

    expect(panel().getByText(HOME_ADVANTAGE_ERROR_MESSAGE)).toBeInTheDocument();
    expect(panel().queryByRole("table")).toBeNull();
    expect(panel().queryByText(ROUNDING_NOTE)).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
