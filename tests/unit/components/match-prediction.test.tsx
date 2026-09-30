import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeBaseline } from "@/lib/home-baseline";
import type { StoredMatch } from "@/lib/match-service";

const { canSeeAnalytics, getHomeBaseline } = vi.hoisted(() => ({
  canSeeAnalytics: vi.fn<() => Promise<boolean>>(),
  getHomeBaseline: vi.fn<() => Promise<HomeBaseline>>(),
}));

vi.mock("@/lib/analytics-access", () => ({ canSeeAnalytics }));
vi.mock("@/lib/match-service", () => ({ getHomeBaseline }));
// The prompt's sign-in flow is sign-in-prompt.test.tsx's; here it only has to
// show which message it was given.
vi.mock("@/components/sign-in-prompt", () => ({
  SignInPrompt: ({ message }: { message: string }) => <p>{message}</p>,
}));

import { ROUNDING_NOTE } from "@/components/competition-analytics";
import {
  baselineSentence,
  MatchPrediction,
  NO_HISTORY_MESSAGE,
  PREDICTION_ERROR_MESSAGE,
  PREDICTION_HEADING,
  PREDICTION_SIGNED_OUT_MESSAGE,
} from "@/components/match-prediction";

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

function upcoming(status = "SCHEDULED"): StoredMatch {
  return {
    source: "taso",
    match: { competitionCode: "spljp26", categoryId: "VL", seasonId: 2026, status },
  } as StoredMatch;
}

async function renderPanel(stored: StoredMatch = upcoming()) {
  const panel = await MatchPrediction({ stored });
  return render(<div>{panel}</div>);
}

describe("baselineSentence", () => {
  it("names the match count, with a no-break space between thousands, and the seasons (S2)", () => {
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

describe("MatchPrediction (specs/051)", () => {
  beforeEach(() => {
    canSeeAnalytics.mockReset().mockResolvedValue(true);
    getHomeBaseline.mockReset().mockResolvedValue(baseline);
  });

  it("shows the three chances as whole percentages, then the two lines (S1, S7, S8)", async () => {
    await renderPanel();

    expect(screen.getByRole("heading", { level: 2, name: PREDICTION_HEADING })).toBeInTheDocument();
    const terms = screen.getAllByRole("term").map((term) => term.textContent);
    const values = screen.getAllByRole("definition").map((value) => value.textContent);
    expect(terms).toEqual(["Kotivoitto", "Tasapeli", "Vierasvoitto"]);
    expect(values).toEqual(["45 %", "26 %", "29 %"]);
    // By exact text content: the matcher's default normaliser would turn the
    // count's no-break space into a plain one, and pass without it.
    const sentence = baselineSentence(baseline);
    expect(
      screen.getByText((_, element) => element?.tagName === "P" && element.textContent === sentence)
    ).toBeInTheDocument();
    expect(screen.getByText(ROUNDING_NOTE)).toBeInTheDocument();
    expect(getHomeBaseline).toHaveBeenCalledWith("taso", "VL");
  });

  it("reads the match's own competition", async () => {
    await renderPanel({
      source: "football-data",
      match: { competitionCode: "CL", seasonId: 2026, status: "TIMED" },
    } as StoredMatch);

    expect(getHomeBaseline).toHaveBeenCalledWith("football-data", "CL");
  });

  it("says so when the competition has no finished match (S9, S11)", async () => {
    getHomeBaseline.mockResolvedValue({ status: "empty" });
    await renderPanel();

    expect(screen.getByText(NO_HISTORY_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole("definition")).not.toBeInTheDocument();
    expect(screen.queryByText(ROUNDING_NOTE)).not.toBeInTheDocument();
  });

  it("shows the failure line when the read fails", async () => {
    getHomeBaseline.mockResolvedValue({ status: "error" });
    await renderPanel();

    expect(screen.getByText(PREDICTION_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole("definition")).not.toBeInTheDocument();
  });

  it("signed out, shows the prompt and reads nothing (S4)", async () => {
    canSeeAnalytics.mockResolvedValue(false);
    const { container } = await renderPanel();

    expect(screen.getByRole("heading", { name: PREDICTION_HEADING })).toBeInTheDocument();
    expect(screen.getByText(PREDICTION_SIGNED_OUT_MESSAGE)).toBeInTheDocument();
    expect(getHomeBaseline).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("%");
  });

  it("renders nothing, and asks nothing, for a match that is not upcoming (S3)", async () => {
    const { container } = await renderPanel(upcoming("FINISHED"));

    expect(container.firstChild).toBeEmptyDOMElement();
    expect(canSeeAnalytics).not.toHaveBeenCalled();
    expect(getHomeBaseline).not.toHaveBeenCalled();
  });

  it("renders nothing for a competition specs/049 does not compare (S5)", async () => {
    const { container } = await renderPanel({
      source: "taso",
      match: { competitionCode: "spljp26", categoryId: "MSC", seasonId: 2026, status: "SCHEDULED" },
    } as StoredMatch);

    expect(container.firstChild).toBeEmptyDOMElement();
  });
});
