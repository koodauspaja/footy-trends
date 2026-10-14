import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NationalTeamMatch, NationalTeamResult } from "@/lib/national-team-service";

/**
 * The national-team page's side of `Analyysit`: whether the section is asked for, where it
 * sits, and on which axis. The panels are `analytics-section.test.tsx`'s and the arithmetic
 * `national-team-analytics.test.ts`'s, so the section stands in with a marker.
 *
 * decisions/041-national-team-analytics.md
 */

const getNationalTeamYearsMock = vi.fn<() => Promise<NationalTeamResult>>();

vi.mock("@/lib/national-team-service", () => ({
  getNationalTeamYears: getNationalTeamYearsMock,
}));

const analyticsSectionMock = vi.fn(async (_props: Record<string, unknown>) => (
  <p>analytics section placeholder</p>
));
vi.mock("@/components/analytics-section", () => ({
  AnalyticsSection: analyticsSectionMock,
}));

import { HISTORY_AXIS } from "@/lib/analytics-axis";
import { FINLAND_TEAM_ID, MENS_TEAM } from "@/lib/national-team";
import { warmModules } from "../../support/warm-module";

function match(providerMatchId: number, year: number): NationalTeamMatch {
  return {
    providerMatchId,
    competitionCode: `maajp${year}`,
    categoryId: "Miehet-A",
    seasonId: year,
    groupId: 1,
    groupName: "A-maaottelut",
    status: "FINISHED",
    kickoffAt: new Date(`${year}-06-05T19:00:00Z`),
    matchday: null,
    homeTeamProviderId: FINLAND_TEAM_ID,
    homeTeamName: "Suomi",
    awayTeamProviderId: 2,
    awayTeamName: "Malta",
    homeGoals: 2,
    awayGoals: 0,
    halfTimeHome: 1,
    halfTimeAway: 0,
    winner: "home",
    competitionName: "A-maaottelut",
  };
}

async function renderPage() {
  // Imported here rather than at the top: a static import is hoisted above the
  // mock factory, which would then read a `vi.fn` that does not exist yet.
  const { NationalTeamPage } = await import("@/components/national-team-page");
  render(await NationalTeamPage({ team: MENS_TEAM }));
}

warmModules(() => import("@/components/national-team-page"));

describe("NationalTeamPage analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getNationalTeamYearsMock.mockResolvedValue({
      status: "ok",
      incomplete: false,
      years: [
        { year: 2026, matches: [match(1, 2026)] },
        { year: 2025, matches: [match(2, 2025)] },
      ],
    });
  });

  it("asks for the section on the history axis, so no string says kausi", async () => {
    await renderPage();

    expect(analyticsSectionMock).toHaveBeenCalledTimes(1);
    expect(analyticsSectionMock.mock.calls[0]?.[0]).toMatchObject({ axis: HISTORY_AXIS });
  });

  it("offers no position, because nothing on this page ranks anybody", async () => {
    await renderPage();

    const props = analyticsSectionMock.mock.calls[0]?.[0] as {
      loadPosition: () => Promise<unknown>;
    };
    expect(await props.loadPosition()).toEqual({ status: "unavailable" });
  });

  it("puts the section above the year list", async () => {
    await renderPage();

    const placeholder = screen.getByText("analytics section placeholder");
    const firstYear = screen.getByRole("heading", { level: 2, name: "2026" });
    // The panels describe every year, so they cannot sit inside one.
    expect(placeholder.compareDocumentPosition(firstYear)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("computes nothing before the section is rendered", async () => {
    await renderPage();

    const props = analyticsSectionMock.mock.calls[0]?.[0] as Record<string, unknown>;
    // Loaders, not values: the sign-in gate inside the section decides whether
    // any analytics value is computed at all.
    for (const [name, value] of Object.entries(props)) {
      if (name === "axis") continue;
      expect(typeof value, name).toBe("function");
    }
  });

  it("still shows the analytics when only some buckets loaded", async () => {
    getNationalTeamYearsMock.mockResolvedValue({
      status: "ok",
      incomplete: true,
      years: [{ year: 2026, matches: [match(1, 2026)] }],
    });

    await renderPage();

    // A partial history is still a history, and the notice above already says
    // it may be short: the same trade the year list makes.
    expect(analyticsSectionMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Kaikkia otteluita ei voitu ladata/)).toBeInTheDocument();
  });

  it("asks for nothing when the page has no matches at all", async () => {
    getNationalTeamYearsMock.mockResolvedValue({ status: "empty" });

    await renderPage();

    expect(analyticsSectionMock).not.toHaveBeenCalled();
  });

  it("asks for nothing when the history could not be read", async () => {
    getNationalTeamYearsMock.mockResolvedValue({ status: "error" });

    await renderPage();

    expect(analyticsSectionMock).not.toHaveBeenCalled();
  });
});
