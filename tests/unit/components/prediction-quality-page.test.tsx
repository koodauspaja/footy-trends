import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QualityReport } from "@/lib/prediction-quality";
import type { QualityResult } from "@/lib/prediction-quality-service";

const { canSeeAnalytics, getPredictionQuality } = vi.hoisted(() => ({
  canSeeAnalytics: vi.fn<() => Promise<boolean>>(),
  getPredictionQuality: vi.fn<(source: string, kind: string) => Promise<QualityResult>>(),
}));

vi.mock("@/lib/analytics-access", () => ({ canSeeAnalytics }));
vi.mock("@/lib/prediction-quality-service", () => ({ getPredictionQuality }));
vi.mock("@/components/sign-in-prompt", () => ({
  SignInPrompt: ({ message }: { message: string }) => <p>{message}</p>,
}));

import {
  ACCURACY_HEADING,
  ACCURACY_NOTE,
  BACKTEST_NOTE,
  BINS_OMITTED_NOTE,
  BRIER_NOTE,
  CALIBRATION_HEADING,
  CALIBRATION_NOTE,
  LOG_LOSS_NOTE,
  modelLabel,
  NO_JUDGED,
  PredictionQualityPage,
  parseQualityParams,
  QUALITY_ERROR,
  QUALITY_HEADING,
  QUALITY_INTRO,
  QUALITY_SIGNED_OUT,
  SCORES_HEADING,
  tooFewSentence,
  windowSentence,
  YARDSTICK_NOTE,
} from "@/components/prediction-quality-page";

const bins = (observed: number | null) =>
  Array.from({ length: 10 }, (_, index) => ({ from: index * 10, probabilities: 60, observed }));

const report: Extract<QualityReport, { status: "ok" }> = {
  status: "ok",
  models: ["home-baseline-v1", "elo-v1"],
  matches: 1234,
  firstSeason: 2016,
  lastSeason: 2026,
  firstYear: 2016,
  lastYear: 2026,
  totals: [
    { model: "home-baseline-v1", matches: 1234, accuracy: 46.2, brier: 0.6123, logLoss: 1.0234 },
    { model: "elo-v1", matches: 1234, accuracy: 50.4, brier: 0.5981, logLoss: 1.0011 },
  ],
  rolling: [
    {
      model: "home-baseline-v1",
      points: [
        { at: Date.UTC(2017, 5, 1), accuracy: 44 },
        { at: Date.UTC(2025, 5, 1), accuracy: 47 },
      ],
    },
    {
      model: "elo-v1",
      points: [
        { at: Date.UTC(2017, 5, 1), accuracy: 48 },
        { at: Date.UTC(2025, 5, 1), accuracy: 52 },
      ],
    },
  ],
  seasons: [{ seasonId: 2025, matches: 198, brier: [0.6111, 0.5999] }],
  calibration: [
    { model: "home-baseline-v1", bins: bins(40) },
    {
      model: "elo-v1",
      bins: [...bins(40).slice(0, 9), { from: 90, probabilities: 3, observed: null }],
    },
  ],
  binsOmitted: true,
};

async function renderPage(params = {}) {
  render(await PredictionQualityPage({ params }));
}

describe("parseQualityParams (S3, S4)", () => {
  it("defaults to the domestic backtest", () => {
    expect(parseQualityParams({})).toEqual({ source: "taso", kind: "backtest" });
  });

  it("reads ulkomaat and ennakkoon, and nothing else", () => {
    expect(parseQualityParams({ alue: "ulkomaat", tyyppi: "ennakkoon" })).toEqual({
      source: "football-data",
      kind: "live",
    });
    expect(parseQualityParams({ alue: "mars", tyyppi: "huomenna" })).toEqual({
      source: "taso",
      kind: "backtest",
    });
  });
});

describe("the sentences", () => {
  it("names the count and the years, one year in the singular", () => {
    expect(windowSentence(1234, 2016, 2026)).toBe(
      "1 234 ottelua vuosilta 2016–2026, joille molemmat mallit ovat antaneet ennusteen."
    );
    expect(windowSentence(12, 2026, 2026)).toBe(
      "12 ottelua vuodelta 2026, joille molemmat mallit ovat antaneet ennusteen."
    );
  });

  it("says how many matches the rolling chart still lacks (S14)", () => {
    expect(tooFewSentence(37)).toBe(
      "Liukuvaan osumatarkkuuteen tarvitaan vähintään 200 ottelua; nyt niitä on 37."
    );
  });
});

describe("modelLabel", () => {
  it("names the known models, and shows any other by its id", () => {
    expect(modelLabel("home-baseline-v1")).toBe("Perustaso");
    expect(modelLabel("elo-v1")).toBe("Elo");
    expect(modelLabel("poisson-v1")).toBe("poisson-v1");
  });
});

describe("PredictionQualityPage (specs/054)", () => {
  beforeEach(() => {
    canSeeAnalytics.mockReset().mockResolvedValue(true);
    getPredictionQuality.mockReset().mockResolvedValue(report);
  });

  it("shows the heading, the intro and both switches, the defaults current", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: QUALITY_HEADING })).toBeInTheDocument();
    expect(screen.getByText(QUALITY_INTRO)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kotimaa" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Ulkomaat" })).toHaveAttribute(
      "href",
      "/ennusteet?alue=ulkomaat&tyyppi=jalkikateen"
    );
    expect(screen.getByRole("link", { name: "Jälkikäteen lasketut" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Ennakkoon tehdyt" })).toHaveAttribute(
      "href",
      "/ennusteet?alue=kotimaa&tyyppi=ennakkoon"
    );
    expect(getPredictionQuality).toHaveBeenCalledWith("taso", "backtest");
  });

  it("reads the provider and kind the parameters name, and keeps the other switch", async () => {
    await renderPage({ alue: "ulkomaat", tyyppi: "ennakkoon" });

    expect(getPredictionQuality).toHaveBeenCalledWith("football-data", "live");
    expect(screen.getByRole("link", { name: "Kotimaa" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Jälkikäteen lasketut" })).not.toHaveAttribute(
      "aria-current"
    );
    expect(screen.getByRole("link", { name: "Kotimaa" })).toHaveAttribute(
      "href",
      "/ennusteet?alue=kotimaa&tyyppi=ennakkoon"
    );
    expect(screen.queryByText(BACKTEST_NOTE)).not.toBeInTheDocument();
  });

  it("states the window and that the backtest knew only earlier matches", async () => {
    const { container } = render(await PredictionQualityPage({ params: {} }));

    expect(container.textContent).toContain(windowSentence(1234, 2016, 2026));
    expect(screen.getByText(BACKTEST_NOTE)).toBeInTheDocument();
  });

  it("shows accuracy per model and the rolling chart with a legend (S5, S6)", async () => {
    await renderPage();

    const panel = screen.getByRole("region", { name: ACCURACY_HEADING });
    const totals = "Perustaso 46\u00a0% · Elo 50\u00a0%";
    expect(
      within(panel).getByText(
        (_, element) => element?.tagName === "P" && element.textContent === totals
      )
    ).toBeInTheDocument();
    expect(panel.querySelectorAll("[data-part=line]")).toHaveLength(2);
    // A long caption breaks onto two lines (specs/050), so read its lines together.
    const caption = [...panel.querySelectorAll("tspan")].map((line) => line.textContent).join(" ");
    expect(caption).toContain("Osuma-% (200 viimeisintä)");
    expect(
      within(panel)
        .getAllByRole("listitem")
        .filter((item) => item.closest("#quality-rolling-text") === null)
        .map((item) => item.textContent)
    ).toEqual(["Perustaso", "Elo"]);
    expect(within(panel).getByText(ACCURACY_NOTE)).toBeInTheDocument();
    expect(panel.querySelector("#quality-rolling-text")?.textContent).toBe(
      "Perustaso: 47\u00a0%Elo: 52\u00a0%"
    );
  });

  it("draws the baseline dashed, the axes fitted to the line's tens and its whole years", async () => {
    await renderPage();

    const panel = screen.getByRole("region", { name: ACCURACY_HEADING });
    const dashed = (model: string) =>
      panel.querySelector(`[data-series="${model}"]`)?.hasAttribute("data-dashed");
    expect([dashed("home-baseline-v1"), dashed("elo-v1")]).toEqual([true, false]);
    const yTicks = [...panel.querySelectorAll("[data-part=y-axis] > text[dominant-baseline]")];
    expect(yTicks.map((tick) => tick.textContent)).toEqual(["40", "50", "60"]);
    // The line runs from June 2017 to June 2025: only the New Years inside it.
    const xTicks = [...panel.querySelectorAll("[data-part=x-axis] > text")].slice(0, -1);
    expect(xTicks.map((tick) => tick.textContent)).toEqual([
      "2018",
      "2019",
      "2020",
      "2021",
      "2022",
      "2023",
      "2024",
      "2025",
    ]);
    // The first point sits on the axis's start.
    const axisStart = panel.querySelector("[data-part=x-axis] > line")?.getAttribute("x1");
    const firstX = panel.querySelector("[data-part=line]")?.getAttribute("points")?.split(",")[0];
    expect(firstX).toBe(axisStart);
  });

  it("keeps the axis open when every point is equal", async () => {
    const flat = [
      { at: Date.UTC(2017, 5, 1), accuracy: 50 },
      { at: Date.UTC(2025, 5, 1), accuracy: 50 },
    ];
    getPredictionQuality.mockResolvedValue({
      ...report,
      rolling: [
        { model: "home-baseline-v1", points: flat },
        { model: "elo-v1", points: flat },
      ],
    });
    await renderPage();

    const panel = screen.getByRole("region", { name: ACCURACY_HEADING });
    expect(within(panel).getByText("60")).toBeInTheDocument();
  });

  it("replaces the rolling chart with the count under 200 matches (S14)", async () => {
    getPredictionQuality.mockResolvedValue({ ...report, matches: 37, rolling: null });
    await renderPage();

    const panel = screen.getByRole("region", { name: ACCURACY_HEADING });
    expect(within(panel).getByText(tooFewSentence(37))).toBeInTheDocument();
    expect(panel.querySelector("[data-part=line]")).toBeNull();
  });

  it("shows Brier and log-loss per model, and Brier per season, with their notes (S7, S9)", async () => {
    await renderPage();

    const panel = screen.getByRole("region", { name: SCORES_HEADING });
    const [totals, seasons] = within(panel).getAllByRole("table");
    const rows = (table: HTMLElement | undefined) =>
      within(table as HTMLElement)
        .getAllByRole("row")
        .map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent));
    expect(rows(totals)).toEqual([
      ["Malli", "Brier", "Log-loss"],
      ["Perustaso", "0,612", "1,023"],
      ["Elo", "0,598", "1,001"],
    ]);
    expect(rows(seasons)).toEqual([
      ["Kausi", "Ottelut", "Perustaso", "Elo"],
      ["2025", "198", "0,611", "0,600"],
    ]);
    for (const note of [BRIER_NOTE, LOG_LOSS_NOTE, YARDSTICK_NOTE]) {
      expect(within(panel).getByText(note)).toBeInTheDocument();
    }
  });

  it("labels football-data's seasons as they span two years", async () => {
    await renderPage({ alue: "ulkomaat" });

    expect(screen.getByRole("rowheader", { name: "2025/26" })).toBeInTheDocument();
  });

  it("draws calibration against the diagonal, and says when a bin is left off (S8)", async () => {
    await renderPage();

    const panel = screen.getByRole("region", { name: CALIBRATION_HEADING });
    expect(panel.querySelectorAll("[data-part=line]")).toHaveLength(3);
    expect(within(panel).getByText("Täydellinen kalibrointi")).toBeInTheDocument();
    expect(within(panel).getByText(CALIBRATION_NOTE)).toBeInTheDocument();
    expect(within(panel).getByText(BINS_OMITTED_NOTE)).toBeInTheDocument();
    const dashed = (model: string) =>
      panel.querySelector(`[data-series="${model}"]`)?.hasAttribute("data-dashed");
    expect([dashed("perfect"), dashed("home-baseline-v1"), dashed("elo-v1")]).toEqual([
      true,
      true,
      false,
    ]);
    // Each bin is drawn at its middle: the first at 5, right of the diagonal's start.
    const startX = (series: string) =>
      Number(
        panel
          .querySelector(`[data-series="${series}"] [data-part=line]`)
          ?.getAttribute("points")
          ?.split(",")[0]
      );
    expect(startX("elo-v1")).toBeGreaterThan(startX("perfect"));
    expect(panel.querySelector("#quality-calibration-text")?.firstChild?.textContent).toMatch(
      /^Perustaso: 0–10\s%: 40\s%, 10–20\s%: 40\s%/
    );
    // The omitted bin is neither drawn nor read out.
    expect(panel.querySelector("#quality-calibration-text")?.lastChild?.textContent).not.toContain(
      "90–100"
    );
  });

  it("says nothing about omitted bins when none is", async () => {
    getPredictionQuality.mockResolvedValue({
      ...report,
      calibration: [
        { model: "home-baseline-v1", bins: bins(40) },
        { model: "elo-v1", bins: bins(45) },
      ],
      binsOmitted: false,
    });
    await renderPage();

    expect(screen.queryByText(BINS_OMITTED_NOTE)).not.toBeInTheDocument();
  });

  it("says so when no prediction has been judged yet (S14)", async () => {
    getPredictionQuality.mockResolvedValue({ status: "empty" });
    await renderPage();

    expect(screen.getByText(NO_JUDGED)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: ACCURACY_HEADING })).not.toBeInTheDocument();
  });

  it("shows the failure line when the read fails", async () => {
    getPredictionQuality.mockResolvedValue({ status: "error" });
    await renderPage();

    expect(screen.getByText(QUALITY_ERROR)).toBeInTheDocument();
  });

  it("signed out, shows the prompt and reads nothing (S12)", async () => {
    canSeeAnalytics.mockResolvedValue(false);
    await renderPage();

    expect(screen.getByText(QUALITY_SIGNED_OUT)).toBeInTheDocument();
    expect(getPredictionQuality).not.toHaveBeenCalled();
  });
});
