import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QualityReport } from "@/lib/prediction-quality";
import type { QualityResult } from "@/lib/prediction-quality-service";

/**
 * The `/ennusteet` page: its switches, its tables and the calibration chart.
 *
 * decisions/054-prediction-quality.md
 * decisions/050-table-volatility.md
 * decisions/055-poisson-goal-model.md
 */

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
  models: ["home-baseline-v1", "elo-v1", "poisson-v1"],
  matches: 1234,
  firstYear: 2016,
  lastYear: 2026,
  totals: [
    { model: "home-baseline-v1", matches: 1234, accuracy: 46.2, brier: 0.6123, logLoss: 1.0234 },
    { model: "elo-v1", matches: 1234, accuracy: 50.4, brier: 0.5981, logLoss: 1.0011 },
    { model: "poisson-v1", matches: 1234, accuracy: 53.6, brier: 0.5744, logLoss: 0.9712 },
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
    {
      model: "poisson-v1",
      points: [
        { at: Date.UTC(2017, 5, 1), accuracy: 51 },
        { at: Date.UTC(2025, 5, 1), accuracy: 55 },
      ],
    },
  ],
  seasons: [{ seasonId: 2025, matches: 198, brier: [0.6111, 0.5999, 0.5802] }],
  calibration: [
    { model: "home-baseline-v1", bins: bins(40) },
    { model: "elo-v1", bins: bins(40) },
    {
      model: "poisson-v1",
      bins: [...bins(40).slice(0, 9), { from: 90, probabilities: 3, observed: null }],
    },
  ],
  binsOmitted: true,
};

async function renderPage(params = {}) {
  render(await PredictionQualityPage({ params }));
}

describe("parseQualityParams", () => {
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
    // Repeated, Next gives an array: not a value the page names, so the default.
    expect(parseQualityParams({ alue: ["ulkomaat", "ulkomaat"], tyyppi: ["ennakkoon"] })).toEqual({
      source: "taso",
      kind: "backtest",
    });
  });
});

describe("the sentences", () => {
  it("names the count and the years, one year in the singular", () => {
    expect(windowSentence(1234, 2016, 2026)).toBe(
      "1 234 ottelua vuosilta 2016–2026, joille kaikki mallit ovat antaneet ennusteen."
    );
    expect(windowSentence(12, 2026, 2026)).toBe(
      "12 ottelua vuodelta 2026, joille kaikki mallit ovat antaneet ennusteen."
    );
  });

  it("says how many matches the rolling chart still lacks", () => {
    expect(tooFewSentence(37)).toBe(
      "Liukuvaan osumatarkkuuteen tarvitaan vähintään 200 ottelua; nyt niitä on 37."
    );
  });
});

describe("modelLabel", () => {
  it("names the known models, and shows any other by its id", () => {
    expect(modelLabel("home-baseline-v1")).toBe("Perustaso");
    expect(modelLabel("elo-v1")).toBe("Elo");
    expect(modelLabel("poisson-v1")).toBe("Poisson");
    expect(modelLabel("elo-form-v1")).toBe("elo-form-v1");
  });
});

describe("PredictionQualityPage", () => {
  beforeEach(() => {
    canSeeAnalytics.mockReset().mockResolvedValue(true);
    getPredictionQuality.mockReset().mockResolvedValue(report);
  });

  it("shows the heading, the intro and both switches, the defaults current", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: QUALITY_HEADING })).toBeInTheDocument();
    expect(screen.getByText(QUALITY_INTRO)).toBeInTheDocument();
    expect(QUALITY_INTRO).toBe(
      "Kuinka usein perustaso, Elo ja Poisson ovat ennustaneet ottelun lopputuloksen oikein, ja kuinka hyvin niiden todennäköisyydet ovat pitäneet paikkansa."
    );
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

  it("shows accuracy per model and the rolling chart with a legend", async () => {
    await renderPage();

    const panel = screen.getByRole("region", { name: ACCURACY_HEADING });
    const totals = "Perustaso 46\u00a0% · Elo 50\u00a0% · Poisson 54\u00a0%";
    expect(
      within(panel).getByText(
        (_, element) => element?.tagName === "P" && element.textContent === totals
      )
    ).toBeInTheDocument();
    expect(panel.querySelectorAll("[data-part=line]")).toHaveLength(3);
    // A long caption breaks onto two lines, so read its lines together.
    const caption = [...panel.querySelectorAll("tspan")].map((line) => line.textContent).join(" ");
    expect(caption).toContain("Osuma-% (200 viimeisintä)");
    expect(
      within(panel)
        .getAllByRole("listitem")
        .filter((item) => item.closest("#quality-rolling-text") === null)
        .map((item) => item.textContent)
    ).toEqual(["Perustaso", "Elo", "Poisson"]);
    // Each legend sample is drawn as its line is.
    expect(
      [...panel.querySelectorAll("li svg line")].map((sample) =>
        sample.getAttribute("stroke-dasharray")
      )
    ).toEqual(["6 4", null, "6 4 2 4"]);
    expect(within(panel).getByText(ACCURACY_NOTE)).toBeInTheDocument();
    expect(panel.querySelector("#quality-rolling-text")?.textContent).toBe(
      "Perustaso: 47\u00a0%Elo: 52\u00a0%Poisson: 55\u00a0%"
    );
  });

  it("draws the baseline dashed and Poisson dash-dotted, the axes fitted to the lines' tens and their whole years", async () => {
    await renderPage();

    const panel = screen.getByRole("region", { name: ACCURACY_HEADING });
    const pattern = (model: string) =>
      panel
        .querySelector(`[data-series="${model}"] [data-part=line]`)
        ?.getAttribute("stroke-dasharray");
    expect([pattern("home-baseline-v1"), pattern("elo-v1"), pattern("poisson-v1")]).toEqual([
      "6 4",
      null,
      "6 4 2 4",
    ]);
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
        { model: "poisson-v1", points: flat },
      ],
    });
    await renderPage();

    const panel = screen.getByRole("region", { name: ACCURACY_HEADING });
    expect(within(panel).getByText("60")).toBeInTheDocument();
  });

  it("replaces the rolling chart with the count under 200 matches", async () => {
    getPredictionQuality.mockResolvedValue({ ...report, matches: 37, rolling: null });
    await renderPage();

    const panel = screen.getByRole("region", { name: ACCURACY_HEADING });
    expect(within(panel).getByText(tooFewSentence(37))).toBeInTheDocument();
    expect(panel.querySelector("[data-part=line]")).toBeNull();
  });

  it("shows Brier and log-loss per model, and Brier per season, with their notes", async () => {
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
      ["Poisson", "0,574", "0,971"],
    ]);
    expect(rows(seasons)).toEqual([
      ["Kausi", "Ottelut", "Perustaso", "Elo", "Poisson"],
      ["2025", "198", "0,611", "0,600", "0,580"],
    ]);
    expect(YARDSTICK_NOTE).toBe(
      "Kummassakin pienempi on parempi: malli on sitä parempi, mitä pienempi sen luku on."
    );
    for (const note of [BRIER_NOTE, LOG_LOSS_NOTE, YARDSTICK_NOTE]) {
      expect(within(panel).getByText(note)).toBeInTheDocument();
    }
  });

  it("labels football-data's seasons as they span two years", async () => {
    await renderPage({ alue: "ulkomaat" });

    expect(screen.getByRole("rowheader", { name: "2025/26" })).toBeInTheDocument();
  });

  it("draws calibration against the diagonal, and says when a bin is left off", async () => {
    await renderPage();

    const panel = screen.getByRole("region", { name: CALIBRATION_HEADING });
    expect(panel.querySelectorAll("[data-part=line]")).toHaveLength(4);
    const perfect = within(panel).getByText("Täydellinen kalibrointi");
    expect(perfect.querySelector("line")?.getAttribute("stroke-dasharray")).toBe("2 4");
    expect(within(panel).getByText(CALIBRATION_NOTE)).toBeInTheDocument();
    expect(within(panel).getByText(BINS_OMITTED_NOTE)).toBeInTheDocument();
    // Four styles: the diagonal dotted, the baseline dashed, Elo solid, Poisson dash-dotted.
    const style = (model: string) => {
      const series = panel.querySelector(`[data-series="${model}"]`);
      if (series?.hasAttribute("data-dotted")) return "dotted";
      if (series?.hasAttribute("data-dash-dotted")) return "dash-dotted";
      return series?.hasAttribute("data-dashed") ? "dashed" : "solid";
    };
    expect([
      style("perfect"),
      style("home-baseline-v1"),
      style("elo-v1"),
      style("poisson-v1"),
    ]).toEqual(["dotted", "dashed", "solid", "dash-dotted"]);
    expect(
      [...panel.querySelectorAll("li svg line")].map((sample) =>
        sample.getAttribute("stroke-dasharray")
      )
    ).toEqual(["2 4", "6 4", null, "6 4 2 4"]);
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

  it("says so when no prediction has been judged yet", async () => {
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

  it("signed out, shows the prompt and reads nothing", async () => {
    canSeeAnalytics.mockResolvedValue(false);
    await renderPage();

    expect(screen.getByText(QUALITY_SIGNED_OUT)).toBeInTheDocument();
    expect(getPredictionQuality).not.toHaveBeenCalled();
  });
});
