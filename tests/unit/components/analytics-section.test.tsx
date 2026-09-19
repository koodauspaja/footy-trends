import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormSeries } from "@/lib/form-series";
import type { GoalsSeries } from "@/lib/goals-series";
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
  ANALYTICS_HEADING,
  AnalyticsSection,
  SIGNED_OUT_MESSAGE,
} from "@/components/analytics-section";
import { FORM_HEADING } from "@/components/form-section";
import { ROLLING_HEADING, TOTALS_HEADING } from "@/components/goals-section";
import { POSITION_HEADING } from "@/components/league-position-section";

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

async function renderSection(
  loadPosition = vi.fn(async (): Promise<PositionSeries> => position),
  loadForm = vi.fn(async (): Promise<FormSeries> => form),
  loadGoals = vi.fn(async (): Promise<GoalsSeries> => goals)
) {
  const view = await AnalyticsSection({ loadPosition, loadForm, loadGoals });
  return { ...render(<div>{view}</div>), loadPosition, loadForm, loadGoals, view };
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
    const { loadPosition, loadForm, loadGoals, container } = await renderSection();

    expect(loadPosition).not.toHaveBeenCalled();
    expect(loadForm).not.toHaveBeenCalled();
    expect(loadGoals).not.toHaveBeenCalled();
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("AnalyticsSection, signed in", () => {
  it("puts every chart under Analyysit, the position chart first", async () => {
    await renderSection();

    const section = screen.getByRole("region", { name: ANALYTICS_HEADING });
    const subheadings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

    expect(section).toContainElement(screen.getByRole("region", { name: FORM_HEADING }));
    expect(subheadings).toEqual([POSITION_HEADING, FORM_HEADING, ROLLING_HEADING, TOTALS_HEADING]);
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

  it("shows the goals charts alone when they are the only ones that apply", async () => {
    await renderSection(
      vi.fn(async (): Promise<PositionSeries> => ({ status: "unavailable" })),
      vi.fn(async (): Promise<FormSeries> => ({ status: "unavailable" }))
    );

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)
    ).toEqual([ROLLING_HEADING, TOTALS_HEADING]);
  });

  it("shows no section at all when no chart applies", async () => {
    const { view } = await renderSection(
      vi.fn(async (): Promise<PositionSeries> => ({ status: "unavailable" })),
      vi.fn(async (): Promise<FormSeries> => ({ status: "unavailable" })),
      vi.fn(async (): Promise<GoalsSeries> => ({ status: "unavailable" }))
    );

    expect(view).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
