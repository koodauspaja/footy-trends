import { render, screen } from "@testing-library/react";
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
  ELO_ROW,
  eloSentence,
  MatchPrediction,
  NO_HISTORY_MESSAGE,
  POISSON_ERROR_MESSAGE,
  POISSON_ROW,
  PREDICTION_ERROR_MESSAGE,
  PREDICTION_HEADING,
  PREDICTION_SIGNED_OUT_MESSAGE,
  poissonSentence,
  QUALITY_LINK,
} from "@/components/match-prediction";
import { type PoissonPrediction, predictPoisson } from "@/lib/poisson";

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

// Each body row of the predictions table, as its cells read.
function tableRows() {
  return screen
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
        prediction: { home: 0.48, draw: 0.27, away: 0.25 },
        homeGoals: 1.64,
        awayGoals: 1.06,
        score: { home: 2, away: 1, probability: 0.116 },
      })
    ).toBe("Poisson: odotetut maalit HJK 1,6 – KuPS 1,1; todennäköisin tulos 2–1 (12\u00a0%).");
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
  });

  it("shows the baseline row, then the Elo row, as whole percentages", async () => {
    await renderPanel();

    expect(screen.getByRole("heading", { level: 2, name: PREDICTION_HEADING })).toBeInTheDocument();
    // The model column's heading is for screen readers only.
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Malli",
      "Kotivoitto",
      "Tasapeli",
      "Vierasvoitto",
    ]);
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
      ROUNDING_NOTE,
      QUALITY_LINK,
    ]);
    // The models' track record, from every `Ennuste`.
    expect(screen.getByRole("link", { name: QUALITY_LINK })).toHaveAttribute("href", "/ennusteet");
    expect(getHomeBaseline).toHaveBeenCalledWith("taso", "VL");
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
  });

  it("renders nothing, and asks nothing, for a match that is not upcoming", async () => {
    const { container } = await renderPanel(upcoming("FINISHED"));

    expect(container.firstChild).toBeEmptyDOMElement();
    expect(canSeeAnalytics).not.toHaveBeenCalled();
    expect(getHomeBaseline).not.toHaveBeenCalled();
  });

  it("renders nothing for a competition the home-advantage table does not compare", async () => {
    const { container } = await renderPanel(upcoming("SCHEDULED", { categoryId: "MSC" }));

    expect(container.firstChild).toBeEmptyDOMElement();
  });
});
