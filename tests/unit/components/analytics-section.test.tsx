import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ELO_HEADING, type EloPanelData } from "@/components/elo-section";
import type { CleanSheetSeries } from "@/lib/clean-sheets";
import type { ComebacksSeries } from "@/lib/comebacks";
import type { FormSeries } from "@/lib/form-series";
import type { GoalsSeries } from "@/lib/goals-series";
import type { HomeAwaySeries } from "@/lib/home-away";
import type { PositionSeries } from "@/lib/position-series";
import { MEASURES, type SeasonComparisonSeries } from "@/lib/season-comparison";
import type { StreakRecordsSeries } from "@/lib/streak-records";
import type { StreaksSeries } from "@/lib/streaks";

/**
 * The Analyysit section: the sign-in gate, which panels a page gets, and the
 * groups they sit in.
 *
 * decisions/031-rolling-form-trend.md
 * decisions/032-goals-scored-vs-conceded.md
 * decisions/033-home-vs-away.md
 * decisions/041-national-team-analytics.md
 * decisions/045-bogey-teams.md
 * decisions/053-elo-ratings.md
 * decisions/416-team-page-folds.md
 * decisions/424-analytics-panel-groups.md
 */

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
  BY_MATCH_HEADING,
  SIGNED_OUT_MESSAGE,
} from "@/components/analytics-section";
import { CLEAN_SHEETS_HEADING } from "@/components/clean-sheets-section";
import { COMEBACKS_HEADING } from "@/components/comebacks-section";
import { FORM_HEADING } from "@/components/form-section";
import { ROLLING_HEADING, TOTALS_HEADING } from "@/components/goals-section";
import { HOME_AWAY_HEADING } from "@/components/home-away-section";
import { POSITION_HEADING } from "@/components/league-position-section";
import { OPPONENTS_GROUP_HEADING, OPPONENTS_HEADING } from "@/components/opponents-section";
import { RECORDS_HEADING } from "@/components/streak-records-section";
import { STREAKS_HEADING } from "@/components/streaks-section";
import { HISTORY_AXIS, SEASON_AXIS } from "@/lib/analytics-axis";
import type { OpponentsSeries } from "@/lib/head-to-head";

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
  scope: "Valioliiga",
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
  loadRecords = vi.fn(async (): Promise<StreakRecordsSeries> => records),
  axis = SEASON_AXIS,
  // Absent unless a test asks for it, as on a national team's page, so the
  // group tests below keep asserting the three groups they describe.
  loadOpponents = vi.fn(async (): Promise<OpponentsSeries> => ({ status: "unavailable" })),
  // Absent unless a test asks for it, for the same reason.
  loadElo = vi.fn(async (): Promise<EloPanelData> => ({ series: { status: "unavailable" } }))
) {
  const view = await AnalyticsSection({
    axis,
    loadPosition,
    loadForm,
    loadGoals,
    loadHomeAway,
    loadCleanSheets,
    loadStreaks,
    loadComebacks,
    loadComparison,
    loadRecords,
    loadOpponents,
    loadElo,
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
    loadOpponents,
    loadElo,
    view,
  };
}

beforeEach(() => {
  canSeeAnalytics.mockReset();
  canSeeAnalytics.mockResolvedValue(true);
});

describe("the groups a page's axis names (specs/041, S13)", () => {
  it("names the middle group for the history it covers, and the last for years", async () => {
    const { container } = await renderSection(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      HISTORY_AXIS
    );

    const groups = [...container.querySelectorAll("h3")].map((heading) => heading.textContent);
    expect(groups).toContain(HISTORY_AXIS.wholeHeading);
    expect(groups).toContain(HISTORY_AXIS.otherHeading);
    // The club pages' wording is gone from this page entirely, heading and all.
    expect(groups).not.toContain(SEASON_AXIS.wholeHeading);
    expect(groups).not.toContain(SEASON_AXIS.otherHeading);
  });
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
    expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
  });

  it("never computes a chart, so the page carries no analytics value at all", async () => {
    // The gate comes before the data: hiding a chart in the browser would still
    // send its values. Not calling the loaders is what guarantees they are not
    // in the page.
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
    const subheadings = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);

    expect(section).toContainElement(screen.getByRole("region", { name: FORM_HEADING }));
    // `Nollapelit` is a running share plotted match by match, so it joins the
    // first group; `Koti- ja vierastilastot` summarises the season and heads
    // the second.
    expect(subheadings).toEqual([
      POSITION_HEADING,
      FORM_HEADING,
      ROLLING_HEADING,
      TOTALS_HEADING,
      CLEAN_SHEETS_HEADING,
      HOME_AWAY_HEADING,
      STREAKS_HEADING,
      COMEBACKS_HEADING,
      SEASON_AXIS.comparisonHeading,
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
      screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)
    ).toEqual([
      ROLLING_HEADING,
      TOTALS_HEADING,
      CLEAN_SHEETS_HEADING,
      HOME_AWAY_HEADING,
      STREAKS_HEADING,
      COMEBACKS_HEADING,
      SEASON_AXIS.comparisonHeading,
      RECORDS_HEADING,
    ]);
  });

  it("puts each panel under its agreed group (#424)", async () => {
    await renderSection();
    const groups = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

    expect(groups).toEqual([BY_MATCH_HEADING, SEASON_AXIS.wholeHeading, SEASON_AXIS.otherHeading]);
    // Each group is a region, so a screen reader moves between groups as it
    // moves between panels.
    for (const [group, panel] of [
      [BY_MATCH_HEADING, CLEAN_SHEETS_HEADING],
      [SEASON_AXIS.wholeHeading, HOME_AWAY_HEADING],
      [SEASON_AXIS.otherHeading, RECORDS_HEADING],
    ] as const) {
      expect(screen.getByRole("region", { name: group })).toContainElement(
        screen.getByRole("region", { name: panel })
      );
    }
  });

  it("shows no heading for a group whose panels all fall away", async () => {
    // A cup season has no position chart; a club with one stored season has
    // nothing in `Muut kaudet`. An empty group heading reads worse than none.
    await renderSection(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      vi.fn(async (): Promise<SeasonComparisonSeries> => ({ status: "unavailable" })),
      vi.fn(async (): Promise<StreakRecordsSeries> => ({ status: "unavailable" }))
    );
    const groups = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

    expect(groups).toEqual([BY_MATCH_HEADING, SEASON_AXIS.wholeHeading]);
    expect(screen.queryByText(SEASON_AXIS.otherHeading)).toBeNull();
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

describe("the Vastustajat group (specs/045, S6)", () => {
  const opponents: OpponentsSeries = {
    status: "ok",
    rows: [
      {
        opponentProviderId: 2,
        opponentName: "KuPS",
        played: 4,
        wins: 0,
        draws: 1,
        losses: 3,
        pointsPerMatch: 0.25,
        lastMet: new Date("2026-05-01T16:00:00Z"),
        href: "/kotimaa/kohtaamiset/1/2",
      },
    ],
    windowSentence: "Perustuu kaudesta 2015 alkaen tallennettuihin otteluihin.",
  };
  const withOpponents = () =>
    renderSection(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      SEASON_AXIS,
      vi.fn(async (): Promise<OpponentsSeries> => opponents)
    );

  it("comes fourth, after Muut kaudet, holding Vaikeimmat vastustajat", async () => {
    await withOpponents();

    const groups = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual([
      BY_MATCH_HEADING,
      SEASON_AXIS.wholeHeading,
      SEASON_AXIS.otherHeading,
      OPPONENTS_GROUP_HEADING,
    ]);
    const group = screen.getByRole("region", { name: OPPONENTS_GROUP_HEADING });
    expect(group).toContainElement(
      screen.getByRole("heading", { level: 4, name: OPPONENTS_HEADING })
    );
  });

  it("is absent where the panel is, on a national team's page", async () => {
    await renderSection();

    expect(screen.queryByRole("heading", { level: 3, name: OPPONENTS_GROUP_HEADING })).toBeNull();
  });

  it("is never loaded for a signed-out reader", async () => {
    canSeeAnalytics.mockResolvedValue(false);
    const { loadOpponents } = await withOpponents();

    expect(loadOpponents).not.toHaveBeenCalled();
    expect(screen.queryByText("KuPS")).toBeNull();
  });
});

describe("Joukkueen vahvuus (Elo) (specs/053 S9)", () => {
  beforeEach(() => {
    canSeeAnalytics.mockReset().mockResolvedValue(true);
  });

  const withElo = () =>
    renderSection(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      SEASON_AXIS,
      undefined,
      vi.fn(
        async (): Promise<EloPanelData> => ({
          series: {
            status: "ok",
            points: [
              { seasonId: 2024, rating: 1510 },
              { seasonId: 2025, rating: 1540 },
            ],
          },
          seasonLabel: String,
        })
      )
    );

  it("sits in Muut kaudet, after the club's records", async () => {
    await withElo();

    const group = screen.getByRole("region", { name: SEASON_AXIS.otherHeading });
    const panels = [...group.querySelectorAll("h4")].map((heading) => heading.textContent);
    expect(panels.at(-1)).toBe(ELO_HEADING);
    expect(panels).toContain(RECORDS_HEADING);
  });

  it("is absent where there is no Elo, a national team's page", async () => {
    await renderSection();

    expect(screen.queryByRole("heading", { level: 4, name: ELO_HEADING })).toBeNull();
  });

  it("is never loaded for a signed-out reader", async () => {
    canSeeAnalytics.mockResolvedValue(false);
    const { loadElo } = await withElo();

    expect(loadElo).not.toHaveBeenCalled();
    expect(screen.queryByText(ELO_HEADING)).toBeNull();
  });
});
