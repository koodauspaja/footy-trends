import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PositionSeries } from "@/lib/position-series";

const { canSeeAnalytics } = vi.hoisted(() => ({
  canSeeAnalytics: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("@/lib/analytics-access", () => ({ canSeeAnalytics }));
// The prompt's button and its sign-in flow are sign-in-prompt.test.tsx's. Here
// it only has to show which message it was given.
vi.mock("@/components/sign-in-prompt", () => ({
  SignInPrompt: ({ message }: { message: string }) => <p>{message}</p>,
}));

import {
  LeaguePositionSection,
  NO_ROUNDS_MESSAGE,
  POSITION_ERROR_MESSAGE,
  POSITION_HEADING,
  SIGNED_OUT_MESSAGE,
  SPLIT_NOTE,
} from "@/components/league-position-section";

const series: PositionSeries = {
  status: "ok",
  points: [
    { round: 1, position: 7 },
    { round: 2, position: 5 },
  ],
  teamCount: 12,
  endsAtSplit: false,
};

async function renderSection(loadSeries = vi.fn(async (): Promise<PositionSeries> => series)) {
  const view = await LeaguePositionSection({ loadSeries });
  return { ...render(<div>{view}</div>), loadSeries, view };
}

beforeEach(() => {
  canSeeAnalytics.mockReset();
  canSeeAnalytics.mockResolvedValue(true);
});

describe("LeaguePositionSection, signed out", () => {
  beforeEach(() => {
    canSeeAnalytics.mockResolvedValue(false);
  });

  it("shows the prompt about analytics as a whole, under the section heading", async () => {
    await renderSection();

    expect(screen.getByRole("heading", { name: POSITION_HEADING })).toBeInTheDocument();
    expect(screen.getByText(SIGNED_OUT_MESSAGE)).toBeInTheDocument();
    expect(SIGNED_OUT_MESSAGE).toBe("Kirjaudu sisään nähdäksesi analyysit ja trendit.");
  });

  it("never computes the series, so the page carries no position at all", async () => {
    /**
     * The gate comes before the data: hiding a chart in the browser would still
     * send its values. Not calling `loadSeries` is what guarantees they are not
     * in the page.
     */
    const { loadSeries, container } = await renderSection();

    expect(loadSeries).not.toHaveBeenCalled();
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).not.toContain("kierroksen jälkeen");
  });
});

describe("LeaguePositionSection, signed in", () => {
  it("draws the chart under its heading, named by it", async () => {
    const { container } = await renderSection();
    const heading = screen.getByRole("heading", { name: POSITION_HEADING });

    expect(container.querySelector("svg")?.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(container.querySelectorAll("[data-part=points] circle")).toHaveLength(2);
  });

  it("scales the chart to the whole league", async () => {
    const { container } = await renderSection();

    expect(container.querySelector("[data-part=y-axis]")?.textContent).toContain("12");
  });

  it("says nothing about the split when the line did not stop at one", async () => {
    await renderSection();

    expect(screen.queryByText(SPLIT_NOTE)).toBeNull();
  });

  it("says why the line stops, beneath it, when it ends at the split", async () => {
    await renderSection(vi.fn(async () => ({ ...series, endsAtSplit: true }) as PositionSeries));

    expect(screen.getByText(SPLIT_NOTE)).toBeInTheDocument();
    expect(SPLIT_NOTE).toBe("Jatkosarjan sijoituksia ei voida laskea tälle kaudelle.");
  });

  it("says so when the season has no played round yet", async () => {
    const { container } = await renderSection(
      vi.fn(async (): Promise<PositionSeries> => ({ status: "no-rounds" }))
    );

    expect(screen.getByText(NO_ROUNDS_MESSAGE)).toBeInTheDocument();
    expect(NO_ROUNDS_MESSAGE).toBe("Kaudella ei ole vielä pelattuja kierroksia.");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("says so when the series cannot be computed", async () => {
    await renderSection(vi.fn(async (): Promise<PositionSeries> => ({ status: "error" })));

    expect(screen.getByText(POSITION_ERROR_MESSAGE)).toBeInTheDocument();
  });

  it("shows no section at all when the league season has no per-round table", async () => {
    const { view } = await renderSection(
      vi.fn(async (): Promise<PositionSeries> => ({ status: "unavailable" }))
    );

    expect(view).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
