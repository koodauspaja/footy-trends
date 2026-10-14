import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EloRatings } from "@/lib/elo-service";
import type { HomeBaseline } from "@/lib/home-baseline";
import type { StoredMatch } from "@/lib/match-service";
import type { PoissonFitResult } from "@/lib/poisson-service";

/**
 * The `Ennuste` panel: the baseline, Elo's and Poisson's rows beside it, and
 * the link to the models' track record.
 *
 * decisions/051-home-win-baseline.md
 * decisions/049-home-advantage-and-draw-rate.md
 * decisions/053-elo-ratings.md
 * decisions/054-prediction-quality.md
 * decisions/055-poisson-goal-model.md
 * decisions/059-cup-predictions.md
 * decisions/058-rivalry-prediction.md
 * decisions/062-scoreline-probability-grid.md
 */

const { canSeeAnalytics, getHomeBaseline, getEloRatings, getPoissonFit } = vi.hoisted(() => ({
  getPoissonFit: vi.fn<() => Promise<PoissonFitResult>>(),
  canSeeAnalytics: vi.fn<() => Promise<boolean>>(),
  getHomeBaseline: vi.fn<() => Promise<HomeBaseline>>(),
  getEloRatings: vi.fn<() => Promise<EloRatings>>(),
}));

vi.mock("@/lib/analytics-access", () => ({ canSeeAnalytics }));
vi.mock("@/lib/match-service", () => ({ getHomeBaseline }));
vi.mock("@/lib/elo-service", () => ({ getEloRatings }));
vi.mock("@/lib/poisson-service", () => ({ getPoissonFit }));
// The prompt's sign-in flow is sign-in-prompt.test.tsx's; here it only has to
// show which message it was given.
vi.mock("@/components/sign-in-prompt", () => ({
  SignInPrompt: ({ message }: { message: string }) => <p>{message}</p>,
}));

import { ROUNDING_NOTE } from "@/components/competition-analytics";
import { ELO_ERROR_MESSAGE } from "@/components/elo-section";
import {
  BASELINE_ROW,
  baselineSentence,
  cellText,
  ELO_ROW,
  eloSentence,
  MatchPrediction,
  NO_HISTORY_MESSAGE,
  POISSON_ERROR_MESSAGE,
  POISSON_ROW,
  PREDICTION_ERROR_MESSAGE,
  PREDICTION_HEADING,
  PREDICTION_SIGNED_OUT_MESSAGE,
  PredictionBody,
  poissonSentence,
  QUALITY_LINK,
  SCORE_GRID_CAP_NOTE,
  SCORE_GRID_INTRO,
  scoreGridCells,
} from "@/components/match-prediction";
import { foldScoreGrid, type PoissonPrediction, predictPoisson, scoreGrid } from "@/lib/poisson";

const baseline: Extract<HomeBaseline, { status: "ok" }> = {
  status: "ok",
  matches: 1234,
  homeShare: 44.6,
  drawShare: 26.4,
  awayShare: 29,
  seasons: { first: 2015, last: 2026 },
  spansCalendarYears: false,
};

const SAME = "Ei huomioi joukkueita, joten ennuste on sama jokaiselle kilpailun ottelulle.";
const percent = (value: number) => `${value} %`;

function upcoming(status = "SCHEDULED", overrides: Record<string, unknown> = {}): StoredMatch {
  return {
    source: "taso",
    match: {
      competitionCode: "spljp26",
      categoryId: "VL",
      seasonId: 2026,
      status,
      homeTeamProviderId: 11,
      homeTeamName: "HJK",
      awayTeamProviderId: 22,
      awayTeamName: "KuPS",
      ...overrides,
    },
  } as StoredMatch;
}

// HJK and KuPS even, once HJK's 60 home points are counted.
const ratings: EloRatings = {
  status: "ok",
  ratings: new Map([
    [11, { rating: 1500, seasonId: 2026 }],
    [22, { rating: 1560, seasonId: 2026 }],
  ]),
};

// HJK expected to score 1,6 at home and KuPS 1,1, in VL; another competition
// beside it, which would expect far more.
const poisson: Extract<PoissonFitResult, { status: "ok" }> = {
  status: "ok",
  fit: {
    competitions: new Map([
      ["Y", { base: 1, drawFactor: 3 }],
      ["VL", { base: 0, drawFactor: 1.1 }],
    ]),
    home: Math.log(1.6),
    attack: new Map(),
    defence: new Map([[11, Math.log(1.1)]]),
  },
};
const goals = predictPoisson(poisson.fit, "VL", 11, 22) as PoissonPrediction;
const POISSON_LINE =
  "Poisson: odotetut maalit HJK 1,6 – KuPS 1,1; todennäköisin tulos 1–1 (13\u00a0%).";
const poissonRow = [
  POISSON_ROW,
  percent(Math.round(goals.prediction.home * 100)),
  percent(Math.round(goals.prediction.draw * 100)),
  percent(Math.round(goals.prediction.away * 100)),
];

async function renderPanel(stored: StoredMatch = upcoming()) {
  const panel = await MatchPrediction({ stored });
  return render(<div>{panel}</div>);
}

// The predictions table is the panel's first; the scoreline grid follows it.
const predictions = () => screen.getAllByRole("table")[0] as HTMLElement;
const scoreGridTable = () => screen.getAllByRole("table")[1] as HTMLElement;

// Each body row of the predictions table, as its cells read.
function tableRows() {
  return within(predictions())
    .getAllByRole("row")
    .slice(1)
    .map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent));
}

describe("baselineSentence", () => {
  it("names the match count, with a no-break space between thousands, and the seasons", () => {
    expect(baselineSentence(baseline)).toBe(
      `Perustaso: kilpailun 1 234 ottelun tulokset kausilta 2015–2026. ${SAME}`
    );
  });

  it("writes a season that spans two years as the site does elsewhere", () => {
    expect(
      baselineSentence({
        ...baseline,
        matches: 1520,
        seasons: { first: 2023, last: 2026 },
        spansCalendarYears: true,
      })
    ).toBe(`Perustaso: kilpailun 1 520 ottelun tulokset kausilta 2023/24–2026/27. ${SAME}`);
  });

  it("writes one season, and one match, in the singular", () => {
    expect(
      baselineSentence({ ...baseline, matches: 90, seasons: { first: 2026, last: 2026 } })
    ).toBe(`Perustaso: kilpailun 90 ottelun tulokset kaudelta 2026. ${SAME}`);
    expect(
      baselineSentence({ ...baseline, matches: 1, seasons: { first: 2026, last: 2026 } })
    ).toBe(`Perustaso: kilpailun 1 ottelun tulos kaudelta 2026. ${SAME}`);
  });
});

describe("eloSentence", () => {
  it("names both teams' ratings, rounded, then how the prediction is made", () => {
    expect(eloSentence("HJK", 1563.4, "KuPS", 1487.6)).toBe(
      "Elo: HJK 1563, KuPS 1488. Kotijoukkueelle lisätään 60 pistettä, ja tasapelin todennäköisyys on kilpailun tasapelien osuus."
    );
  });
});

describe("poissonSentence", () => {
  it("names each side's expected goals to one decimal, then the most likely score and its whole percentage", () => {
    expect(
      poissonSentence("HJK", "KuPS", {
        homeGoals: 1.64,
        awayGoals: 1.06,
        score: { home: 2, away: 1, probability: 0.116 },
      })
    ).toBe("Poisson: odotetut maalit HJK 1,6 – KuPS 1,1; todennäköisin tulos 2–1 (12\u00a0%).");
  });
});

describe("cellText", () => {
  it("prints a whole percent", () => {
    expect(cellText(0.124)).toBe("12\u00a0%");
    expect(cellText(0.005)).toBe("1\u00a0%");
  });

  it("prints a probability that rounds to zero as less than one", () => {
    expect(cellText(0.0049)).toBe("<1\u00a0%");
    expect(cellText(0)).toBe("<1\u00a0%");
  });
});

describe("scoreGridCells", () => {
  const marked = (cells: ReturnType<typeof scoreGridCells>) =>
    cells.flatMap((row, home) => row.flatMap((cell, away) => (cell.marked ? [[home, away]] : [])));
  const prediction = (homeGoals: number, awayGoals: number): PoissonPrediction => {
    const grid = scoreGrid(homeGoals, awayGoals, 1);
    return { ...goals, homeGoals, awayGoals, grid, score: mostLikely(grid) };
  };
  // The largest cell, as the model picks it; no two are equal in these grids.
  const mostLikely = (grid: number[][]) => {
    let best = { home: 0, away: 0, probability: 0 };
    grid.forEach((row, home) => {
      row.forEach((probability, away) => {
        if (probability > best.probability) best = { home, away, probability };
      });
    });
    return best;
  };

  it("prints the folded grid, home goals down, each cell a whole percent", () => {
    const cells = scoreGridCells(goals);
    const folded = foldScoreGrid(goals.grid, 5);

    expect(cells.map((row) => row.length)).toEqual([6, 6, 6, 6, 6, 6]);
    expect(cells.map((row) => row.map((cell) => cell.text))).toEqual(
      folded.map((row) => row.map(cellText))
    );
    // HJK is expected to score more: 2–0 is likelier than 0–2. By hand, e^-2,7 · 1,6² / 2
    // is 8,6 % and e^-2,7 · 1,1² / 2 is 4,1 %, each a little less once the draws are scaled up.
    expect(folded[2]?.[0] as number).toBeGreaterThan(folded[0]?.[2] as number);
    expect(cells[2]?.[0]?.text).toBe("8\u00a0%");
    expect(cells[0]?.[2]?.text).toBe("4\u00a0%");
    expect(cells[5]?.[5]?.text).toBe("<1\u00a0%");
  });

  it("shades each cell by its share of the largest shown, and none is left unshaded", () => {
    const levels = scoreGridCells(goals).map((row) => row.map((cell) => cell.level));

    // 1–1 is the largest cell; a cell printed as less than one percent is still filled.
    expect(levels[1]?.[1]).toBe(4);
    expect(levels[5]?.[5]).toBe(1);
    expect(new Set(levels.flat())).toEqual(new Set([1, 2, 3, 4]));
  });

  it("marks the one cell of the score the Poisson line names", () => {
    expect(goals.score).toMatchObject({ home: 1, away: 1 });
    expect(marked(scoreGridCells(goals))).toEqual([[1, 1]]);
  });

  it("keeps the mark on the most likely score when a 5+ cell is larger", () => {
    // 3,5 – 0,5: 3–0 is the likeliest single score, and five or more against none likelier still.
    const lopsided = prediction(3.5, 0.5);
    const cells = scoreGridCells(lopsided);
    const folded = foldScoreGrid(lopsided.grid, 5);

    expect(lopsided.score).toMatchObject({ home: 3, away: 0 });
    expect(folded[5]?.[0] as number).toBeGreaterThan(lopsided.score.probability);
    expect(marked(cells)).toEqual([[3, 0]]);
    expect(cells[5]?.[0]).toMatchObject({ level: 4, marked: false });
  });

  it("marks the 5+ cell that holds a most likely score of five or more goals", () => {
    const rout = prediction(6.2, 0.3);

    expect(rout.score).toMatchObject({ home: 6, away: 0 });
    expect(marked(scoreGridCells(rout))).toEqual([[5, 0]]);
    expect(
      marked(scoreGridCells({ ...rout, score: { home: 0, away: 7, probability: 0.1 } }))
    ).toEqual([[0, 5]]);
  });

  it("leaves a cell that is exactly zero unshaded", () => {
    const empty = scoreGridCells({
      ...goals,
      grid: [[1]],
      score: { home: 0, away: 0, probability: 1 },
    });

    expect(empty[0]?.[0]).toEqual({ level: 4, text: "100\u00a0%", marked: true });
    expect(empty[3]?.[2]).toEqual({ level: 0, text: "<1\u00a0%", marked: false });
  });
});

describe("MatchPrediction", () => {
  beforeEach(() => {
    canSeeAnalytics.mockReset().mockResolvedValue(true);
    getHomeBaseline.mockReset().mockResolvedValue(baseline);
    getEloRatings.mockReset().mockResolvedValue(ratings);
    getPoissonFit.mockReset().mockResolvedValue(poisson);
  });

  it("shows the Poisson row after Elo's, from the provider's fit and the match's competition", async () => {
    await renderPanel();

    expect(tableRows()).toEqual([
      [BASELINE_ROW, percent(45), percent(26), percent(29)],
      [ELO_ROW, percent(37), percent(26), percent(37)],
      poissonRow,
    ]);
    // A home side expected to outscore its guest is the likelier winner.
    expect(goals.prediction.home).toBeGreaterThan(goals.prediction.away);
    expect(getPoissonFit).toHaveBeenCalledWith("taso");
    expect(screen.queryByText(POISSON_ERROR_MESSAGE)).not.toBeInTheDocument();
  });

  it("shows the scoreline grid under the Poisson line: home down, away across, 0–4 and 5+", async () => {
    await renderPanel();
    const grid = scoreGridTable();

    expect(SCORE_GRID_INTRO).toBe("Tulosten todennäköisyydet Poisson-mallin mukaan:");
    expect(SCORE_GRID_CAP_NOTE).toBe("5+ tarkoittaa viittä tai useampaa maalia.");
    const labels = ["0", "1", "2", "3", "4", "5+"];
    expect(
      within(grid)
        .getAllByRole("columnheader")
        .map((header) => header.textContent)
    ).toEqual(["HJK ↓ / KuPS →", ...labels]);
    expect(
      within(grid)
        .getAllByRole("rowheader")
        .map((header) => header.textContent)
    ).toEqual(labels);
    // Row by row as the model's own cells: HJK's goals down.
    const shown = within(grid)
      .getAllByRole("row")
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole("cell")
          .map((cell) => cell.textContent)
      );
    expect(shown).toEqual(scoreGridCells(goals).map((row) => row.map((cell) => cell.text)));
    expect(shown[2]?.[0]).toBe("8\u00a0%");
    expect(shown[0]?.[2]).toBe("4\u00a0%");
  });

  it("outlines the cell of the score the Poisson line names, its figure bold, and no other", async () => {
    await renderPanel();
    const cells = within(scoreGridTable()).getAllByRole("cell");
    const marked = cells.filter((cell) => cell.hasAttribute("data-marked"));

    expect(marked).toHaveLength(1);
    // 1–1: the second row's second cell.
    expect(cells.indexOf(marked[0] as HTMLElement)).toBe(7);
    expect(marked[0]).toHaveClass("font-bold");
    expect(marked[0]?.style.outline).toContain("2px solid");
    const plain = cells[0] as HTMLElement;
    expect(plain).not.toHaveClass("font-bold");
    expect(plain.style.outline).toBe("");
    // Shaded like any other cell of its level.
    expect(marked[0]?.getAttribute("data-level")).toBe("4");
    expect(marked[0]?.style.backgroundColor).toContain("85%");
  });

  it("keeps the other rows and says so when the Poisson fit fails", async () => {
    getPoissonFit.mockResolvedValue({ status: "error" });
    const { container } = await renderPanel();

    expect(tableRows()).toEqual([
      [BASELINE_ROW, percent(45), percent(26), percent(29)],
      [ELO_ROW, percent(37), percent(26), percent(37)],
    ]);
    expect(screen.getByText(POISSON_ERROR_MESSAGE)).toBeInTheDocument();
    expect(POISSON_ERROR_MESSAGE).toBe(
      "Poisson-mallia ei voitu laskea. Yritä myöhemmin uudelleen."
    );
    expect(container.textContent).not.toContain("Poisson:");
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.queryByText(SCORE_GRID_INTRO)).not.toBeInTheDocument();
    expect(screen.queryByText(SCORE_GRID_CAP_NOTE)).not.toBeInTheDocument();
    expect(screen.queryByText(ELO_ERROR_MESSAGE)).not.toBeInTheDocument();
  });

  it("shows no Poisson row for a competition the fit has no match of, and no failure either", async () => {
    getPoissonFit.mockResolvedValue({
      status: "ok",
      fit: { ...poisson.fit, competitions: new Map([["Y", { base: 1, drawFactor: 3 }]]) },
    });
    const { container } = await renderPanel();

    expect(tableRows()).toHaveLength(2);
    expect(container.textContent).not.toContain("Poisson");
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(container.textContent).not.toContain("5+");
  });

  it("shows the baseline row, then the Elo row, as whole percentages", async () => {
    await renderPanel();

    expect(screen.getByRole("heading", { level: 2, name: PREDICTION_HEADING })).toBeInTheDocument();
    // The model column's heading is for screen readers only.
    expect(
      within(predictions())
        .getAllByRole("columnheader")
        .map((header) => header.textContent)
    ).toEqual(["Malli", "Kotivoitto", "Tasapeli", "Vierasvoitto"]);
    // Elo: even sides, so the draw is the baseline's 26,4 % and the rest halves.
    expect(tableRows().slice(0, 2)).toEqual([
      [BASELINE_ROW, percent(45), percent(26), percent(29)],
      [ELO_ROW, percent(37), percent(26), percent(37)],
    ]);
    expect(screen.getByText(eloSentence("HJK", 1500, "KuPS", 1560))).toBeInTheDocument();
    expect(getEloRatings).toHaveBeenCalledWith("taso");
  });

  it("keeps the baseline's line and the rounding line, in that order around the Elo and Poisson lines", async () => {
    const { container } = await renderPanel();

    // By exact text content: the matcher's default normaliser would turn the
    // count's no-break space into a plain one, and pass without it.
    const lines = [...container.querySelectorAll("p")].map((line) => line.textContent);
    expect(lines).toEqual([
      baselineSentence(baseline),
      eloSentence("HJK", 1500, "KuPS", 1560),
      POISSON_LINE,
      SCORE_GRID_INTRO,
      SCORE_GRID_CAP_NOTE,
      "Ennuste perustuu tähän mennessä pelattuihin otteluihin ja muuttuu, kun uusia pelataan.",
      ROUNDING_NOTE,
      QUALITY_LINK,
    ]);
    expect(getHomeBaseline).toHaveBeenCalledWith("taso", "VL");
  });

  it("links to the models' track record in the match's own competition", async () => {
    await renderPanel();

    expect(screen.getByRole("link", { name: QUALITY_LINK })).toHaveAttribute(
      "href",
      "/ennusteet?alue=kotimaa&tyyppi=jalkikateen&kilpailu=VL"
    );
  });

  it("links a football-data match to its competition under Ulkomaat", async () => {
    await renderPanel({
      source: "football-data",
      match: {
        competitionCode: "PL",
        seasonId: 2026,
        status: "TIMED",
        homeTeamProviderId: 11,
        homeTeamName: "Arsenal FC",
        awayTeamProviderId: 22,
        awayTeamName: "Chelsea FC",
      },
    } as StoredMatch);

    expect(screen.getByRole("link", { name: QUALITY_LINK })).toHaveAttribute(
      "href",
      "/ennusteet?alue=ulkomaat&tyyppi=jalkikateen&kilpailu=PL"
    );
  });

  it("reads the match's own competition", async () => {
    await renderPanel({
      source: "football-data",
      match: {
        competitionCode: "CL",
        seasonId: 2026,
        status: "TIMED",
        homeTeamProviderId: 57,
        homeTeamName: "Arsenal FC",
        awayTeamProviderId: 61,
        awayTeamName: "Chelsea FC",
      },
    } as StoredMatch);

    expect(getHomeBaseline).toHaveBeenCalledWith("football-data", "CL");
    expect(getEloRatings).toHaveBeenCalledWith("football-data");
    expect(getPoissonFit).toHaveBeenCalledWith("football-data");
  });

  it("predicts an unrated team from 1500, and a new season's from its regressed rating", async () => {
    getEloRatings.mockResolvedValue({
      status: "ok",
      ratings: new Map([[11, { rating: 1650, seasonId: 2025 }]]),
    });
    await renderPanel();

    // HJK 1650 last season: 1600 this one. KuPS unrated: 1500.
    expect(screen.getByText(eloSentence("HJK", 1600, "KuPS", 1500))).toBeInTheDocument();
  });

  it("keeps the baseline and says so when the Elo read fails", async () => {
    getEloRatings.mockResolvedValue({ status: "error" });
    await renderPanel();

    expect(tableRows()).toEqual([
      [BASELINE_ROW, percent(45), percent(26), percent(29)],
      poissonRow,
    ]);
    expect(screen.getByText(ELO_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/^Elo:/)).not.toBeInTheDocument();
    expect(screen.queryByText(POISSON_ERROR_MESSAGE)).not.toBeInTheDocument();
  });

  it("shows no Elo or Poisson row for a placeholder side, and no failure either", async () => {
    await renderPanel(upcoming("SCHEDULED", { awayTeamProviderId: 0, awayTeamName: "Tuntematon" }));

    expect(tableRows()).toEqual([[BASELINE_ROW, percent(45), percent(26), percent(29)]]);
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.queryByText(SCORE_GRID_INTRO)).not.toBeInTheDocument();
    expect(screen.queryByText(ELO_ERROR_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByText(POISSON_ERROR_MESSAGE)).not.toBeInTheDocument();
  });

  it("says so when the competition has no finished match, and shows no Elo either", async () => {
    getHomeBaseline.mockResolvedValue({ status: "empty" });
    await renderPanel();

    expect(screen.getByText(NO_HISTORY_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(ROUNDING_NOTE)).not.toBeInTheDocument();
  });

  it("shows the failure line when the baseline read fails", async () => {
    getHomeBaseline.mockResolvedValue({ status: "error" });
    await renderPanel();

    expect(screen.getByText(PREDICTION_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("signed out, shows the prompt and reads nothing", async () => {
    canSeeAnalytics.mockResolvedValue(false);
    const { container } = await renderPanel();

    expect(screen.getByRole("heading", { name: PREDICTION_HEADING })).toBeInTheDocument();
    expect(screen.getByText(PREDICTION_SIGNED_OUT_MESSAGE)).toBeInTheDocument();
    expect(getHomeBaseline).not.toHaveBeenCalled();
    expect(getEloRatings).not.toHaveBeenCalled();
    expect(getPoissonFit).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("%");
    expect(container.textContent).not.toContain("Poisson");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain("data-level");
  });

  it("renders nothing, and asks nothing, for a match that is not upcoming", async () => {
    const { container } = await renderPanel(upcoming("FINISHED"));

    expect(container.firstChild).toBeEmptyDOMElement();
    expect(canSeeAnalytics).not.toHaveBeenCalled();
    expect(getHomeBaseline).not.toHaveBeenCalled();
  });

  it("renders nothing for a competition the models do not predict", async () => {
    const { container } = await renderPanel(upcoming("SCHEDULED", { categoryId: "LC" }));

    expect(container.firstChild).toBeEmptyDOMElement();
  });
});

describe("PredictionBody", () => {
  beforeEach(() => {
    canSeeAnalytics.mockReset().mockResolvedValue(false);
    getHomeBaseline.mockReset().mockResolvedValue(baseline);
    getEloRatings.mockReset().mockResolvedValue(ratings);
    getPoissonFit.mockReset().mockResolvedValue(poisson);
  });

  it("is the panel's rows and lines without its heading, and leaves the gate to its caller", async () => {
    const body = await PredictionBody({
      stored: upcoming(),
      competition: { kind: "taso", code: "VL" },
    });
    const { container } = render(<div>{body}</div>);

    expect(tableRows().map(([model]) => model)).toEqual([BASELINE_ROW, ELO_ROW, POISSON_ROW]);
    expect([...container.querySelectorAll("p")].map((line) => line.textContent)).toContain(
      POISSON_LINE
    );
    expect(screen.getByRole("link", { name: QUALITY_LINK })).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(canSeeAnalytics).not.toHaveBeenCalled();
  });

  it("reads the models for the competition it is given", async () => {
    await PredictionBody({ stored: upcoming(), competition: { kind: "taso", code: "M1L" } });

    expect(getHomeBaseline).toHaveBeenCalledWith("taso", "M1L");
    expect(getEloRatings).toHaveBeenCalledWith("taso");
    expect(getPoissonFit).toHaveBeenCalledWith("taso");
  });
});

describe("MatchPrediction on a Suomen Cup tie", () => {
  // HJK and KuPS rated by the leagues; 33 has played only the cup.
  const cupTie = (overrides: Record<string, unknown> = {}) =>
    upcoming("SCHEDULED", { categoryId: "MSC", ...overrides });
  const cupFit: Extract<PoissonFitResult, { status: "ok" }> = {
    status: "ok",
    fit: {
      ...poisson.fit,
      competitions: new Map([
        ...poisson.fit.competitions,
        ["MSC", { base: 0.2, drawFactor: 0.9, cup: true }],
      ]),
      attack: new Map([
        [11, 0],
        [22, 0],
      ]),
    },
  };

  beforeEach(() => {
    canSeeAnalytics.mockReset().mockResolvedValue(true);
    getHomeBaseline.mockReset().mockResolvedValue(baseline);
    getEloRatings.mockReset().mockResolvedValue(ratings);
    getPoissonFit.mockReset().mockResolvedValue(cupFit);
  });

  it("predicts a tie between two rated sides with every model, from the cup's own baseline", async () => {
    await renderPanel(cupTie());

    expect(tableRows().map((row) => row[0])).toEqual([BASELINE_ROW, ELO_ROW, POISSON_ROW]);
    expect(getHomeBaseline).toHaveBeenCalledWith("taso", "MSC");
  });

  it("shows the scoreline grid under the Poisson line", async () => {
    await renderPanel(cupTie());

    expect(scoreGridTable()).toBeInTheDocument();
  });

  it.each([
    ["the home side", { homeTeamProviderId: 33 }],
    ["the away side", { awayTeamProviderId: 33 }],
  ])("renders nothing, signed in or out, when %s has never been rated", async (_side, sides) => {
    for (const signedIn of [true, false]) {
      canSeeAnalytics.mockResolvedValue(signedIn);
      const { container, unmount } = await renderPanel(cupTie(sides));
      expect(container.firstChild).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("renders nothing when the ratings that would say so cannot be read", async () => {
    getEloRatings.mockResolvedValue({ status: "error" });

    const { container } = await renderPanel(cupTie());

    expect(container.firstChild).toBeEmptyDOMElement();
  });

  it("does not read the ratings to place a league match", async () => {
    canSeeAnalytics.mockResolvedValue(false);

    await renderPanel(upcoming());

    expect(getEloRatings).not.toHaveBeenCalled();
  });
});
