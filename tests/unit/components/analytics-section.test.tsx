import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CleanSheetSeries } from "@/lib/clean-sheets";
import type { ComebacksSeries } from "@/lib/comebacks";
import type { FormSeries } from "@/lib/form-series";
import type { GoalsSeries } from "@/lib/goals-series";
import type { HomeAwaySeries } from "@/lib/home-away";
import type { PositionSeries } from "@/lib/position-series";
import { MEASURES, type SeasonComparisonSeries } from "@/lib/season-comparison";
import type { StreakRecordsSeries } from "@/lib/streak-records";
import type { StreaksSeries } from "@/lib/streaks";

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
  ANALYTICS_HEADING,
  AnalyticsSection,
  SIGNED_OUT_MESSAGE,
} from "@/components/analytics-section";
import { CLEAN_SHEETS_HEADING } from "@/components/clean-sheets-section";
import { COMEBACKS_HEADING } from "@/components/comebacks-section";
import { FORM_HEADING } from "@/components/form-section";
import { ROLLING_HEADING, TOTALS_HEADING } from "@/components/goals-section";
import { HOME_AWAY_HEADING } from "@/components/home-away-section";
import { POSITION_HEADING } from "@/components/league-position-section";
import { COMPARISON_HEADING } from "@/components/season-comparison-section";
import { RECORDS_HEADING } from "@/components/streak-records-section";
import { STREAKS_HEADING } from "@/components/streaks-section";

const position: PositionSeries = {
  status: "ok",
  points: [{ round: 1, position: 2, played: true }],
  teamCount: 12,
  endsAtSplit: false,
};
const form: FormSeries = { status: "ok", points: [{ match: 5, form: 2.2 }] };
const goals: GoalsSeries = {
  status: "ok",
  rolling: [{ match: 5, scored: 1.4, conceded: 0.8 }],
  totals: [{ match: 5, scored: 9, conceded: 7 }],
};
const homeAway: HomeAwaySeries = {
  status: "ok",
  home: { matches: 3, won: 2, drawn: 1, lost: 0, scored: 5, conceded: 2 },
  away: { matches: 2, won: 0, drawn: 1, lost: 1, scored: 1, conceded: 3 },
};
const cleanSheets: CleanSheetSeries = {
  status: "ok",
  points: [{ match: 1, kept: 1, share: 100 }],
};
const streaks: StreaksSeries = {
  status: "ok",
  current: { outcome: "win", length: 1 },
  longest: {
    wins: { length: 1, from: 1, to: 1 },
    unbeaten: { length: 1, from: 1, to: 1 },
    defeats: null,
    winless: null,
  },
};
const comebacks: ComebacksSeries = {
  status: "ok",
  trailed: { matches: 2, won: 1, drew: 1, lost: 0 },
  led: { matches: 3, won: 1, drew: 1, lost: 1 },
  missing: 0,
  known: 5,
};
const records: StreakRecordsSeries = {
  status: "ok",
  records: {
    wins: { length: 3, from: "2024", to: "2025" },
    unbeaten: { length: 5, from: "2024", to: "2025" },
    defeats: null,
    winless: null,
  },
  seasons: 2,
};
const comparison: SeasonComparisonSeries = {
  status: "ok",
  rows: MEASURES.map((measure) => ({ measure, selected: 1, baseline: 2 })),
  seasons: 3,
  competitions: ["Valioliiga"],
  teamCount: 20,
};

async function renderSection(
  loadPosition = vi.fn(async (): Promise<PositionSeries> => position),
  loadForm = vi.fn(async (): Promise<FormSeries> => form),
  loadGoals = vi.fn(async (): Promise<GoalsSeries> => goals),
  loadHomeAway = vi.fn(async (): Promise<HomeAwaySeries> => homeAway),
  loadCleanSheets = vi.fn(async (): Promise<CleanSheetSeries> => cleanSheets),
  loadStreaks = vi.fn(async (): Promise<StreaksSeries> => streaks),
  loadComebacks = vi.fn(async (): Promise<ComebacksSeries> => comebacks),
  loadComparison = vi.fn(async (): Promise<SeasonComparisonSeries> => comparison),
  loadRecords = vi.fn(async (): Promise<StreakRecordsSeries> => records)
) {
  const view = await AnalyticsSection({
    loadPosition,
    loadForm,
    loadGoals,
    loadHomeAway,
    loadCleanSheets,
    loadStreaks,
    loadComebacks,
    loadComparison,
    loadRecords,
  });
  return {
    ...render(<div>{view}</div>),
    loadPosition,
    loadForm,
    loadGoals,
    loadHomeAway,
    loadCleanSheets,
    loadStreaks,
    loadComebacks,
    view,
  };
}

beforeEach(() => {
  canSeeAnalytics.mockReset();
  canSeeAnalytics.mockResolvedValue(true);
});

describe("AnalyticsSection, signed out", () => {
  beforeEach(() => {
    canSeeAnalytics.mockResolvedValue(false);
  });

  it("shows the prompt once, under Analyysit, and no chart headings", async () => {
    await renderSection();

    expect(screen.getByRole("heading", { level: 2, name: ANALYTICS_HEADING })).toBeInTheDocument();
    expect(ANALYTICS_HEADING).toBe("Analyysit");
    expect(screen.getAllByText(SIGNED_OUT_MESSAGE)).toHaveLength(1);
    expect(SIGNED_OUT_MESSAGE).toBe("Kirjaudu sisään nähdäksesi analyysit ja trendit.");
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });

  it("never computes a chart, so the page carries no analytics value at all", async () => {
    /**
     * The gate comes before the data: hiding a chart in the browser would still
     * send its values. Not calling the loaders is what guarantees they are not
     * in the page.
     */
    const {
      loadPosition,
      loadForm,
      loadGoals,
      loadHomeAway,
      loadCleanSheets,
      loadStreaks,
      loadComebacks,
      container,
    } = await renderSection();

    expect(loadPosition).not.toHaveBeenCalled();
    expect(loadForm).not.toHaveBeenCalled();
    expect(loadGoals).not.toHaveBeenCalled();
    expect(loadHomeAway).not.toHaveBeenCalled();
    expect(loadCleanSheets).not.toHaveBeenCalled();
    expect(loadStreaks).not.toHaveBeenCalled();
    expect(loadComebacks).not.toHaveBeenCalled();
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("AnalyticsSection, signed in", () => {
  it("puts every chart under Analyysit, the position chart first", async () => {
    await renderSection();

    const section = screen.getByRole("region", { name: ANALYTICS_HEADING });
    const subheadings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

    expect(section).toContainElement(screen.getByRole("region", { name: FORM_HEADING }));
    expect(subheadings).toEqual([
      POSITION_HEADING,
      FORM_HEADING,
      ROLLING_HEADING,
      TOTALS_HEADING,
      HOME_AWAY_HEADING,
      CLEAN_SHEETS_HEADING,
      STREAKS_HEADING,
      COMEBACKS_HEADING,
      COMPARISON_HEADING,
      RECORDS_HEADING,
    ]);
    expect(screen.queryByText(SIGNED_OUT_MESSAGE)).toBeNull();
  });

  it("shows the charts that apply when another does not", async () => {
    // A TASO season shown with TASO's own numbers has no per-round position,
    // but its results still give a form.
    await renderSection(vi.fn(async (): Promise<PositionSeries> => ({ status: "unavailable" })));

    expect(screen.getByRole("heading", { level: 2, name: ANALYTICS_HEADING })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: POSITION_HEADING })).toBeNull();
    expect(screen.getByRole("heading", { name: FORM_HEADING })).toBeInTheDocument();
  });

  it("shows only the charts that apply, in their order", async () => {
    await renderSection(
      vi.fn(async (): Promise<PositionSeries> => ({ status: "unavailable" })),
      vi.fn(async (): Promise<FormSeries> => ({ status: "unavailable" }))
    );

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)
    ).toEqual([
      ROLLING_HEADING,
      TOTALS_HEADING,
      HOME_AWAY_HEADING,
      CLEAN_SHEETS_HEADING,
      STREAKS_HEADING,
      COMEBACKS_HEADING,
      COMPARISON_HEADING,
      RECORDS_HEADING,
    ]);
  });

  it("sits in a fold that starts open, like the match list (#416)", async () => {
    const { container } = await renderSection();
    const details = container.querySelector("details");

    expect(details?.open).toBe(true);
    expect(details?.querySelector("summary")).toContainElement(
      screen.getByRole("heading", { level: 2, name: ANALYTICS_HEADING })
    );
    expect(details?.querySelector("svg")).not.toBeNull();
  });

  it("shows no section at all when no chart applies", async () => {
    const { view } = await renderSection(
      vi.fn(async (): Promise<PositionSeries> => ({ status: "unavailable" })),
      vi.fn(async (): Promise<FormSeries> => ({ status: "unavailable" })),
      vi.fn(async (): Promise<GoalsSeries> => ({ status: "unavailable" })),
      vi.fn(async (): Promise<HomeAwaySeries> => ({ status: "unavailable" })),
      vi.fn(async (): Promise<CleanSheetSeries> => ({ status: "unavailable" })),
      vi.fn(async (): Promise<StreaksSeries> => ({ status: "unavailable" })),
      vi.fn(async (): Promise<ComebacksSeries> => ({ status: "unavailable" })),
      vi.fn(async (): Promise<SeasonComparisonSeries> => ({ status: "unavailable" })),
      vi.fn(async (): Promise<StreakRecordsSeries> => ({ status: "unavailable" }))
    );

    expect(view).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
