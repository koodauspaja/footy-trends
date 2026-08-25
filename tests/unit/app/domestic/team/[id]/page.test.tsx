import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedTasoMatch } from "@/lib/taso";
import type { TeamMatchesResult } from "@/lib/taso-standings-service";

const getTeamMatchesMock = vi.fn<() => Promise<TeamMatchesResult>>();

/**
 * Season discovery is mocked so these page tests stay pure unit tests: the
 * real `resolveTasoSeasonContext` queries `taso_matches` for its fallback,
 * which would make them depend on a live database.
 */
const resolveTasoSeasonContextMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ currentSeason: 2026, defaultSeason: 2026 })
);

vi.mock("@/lib/taso-standings-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/taso-standings-service")>();
  return {
    ...actual,
    getTeamMatches: getTeamMatchesMock,
    resolveTasoSeasonContext: resolveTasoSeasonContextMock,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function buildMatch(overrides: Partial<NormalizedTasoMatch> = {}): NormalizedTasoMatch {
  return {
    providerMatchId: 1,
    competitionCode: "spljp26",
    categoryId: "VL",
    seasonId: 2026,
    groupId: 1,
    groupName: "Runkosarja",
    status: "FINISHED",
    kickoffAt: new Date("2026-04-01T14:00:00Z"),
    matchday: 1,
    homeTeamProviderId: 1,
    homeTeamName: "HJK",
    awayTeamProviderId: 2,
    awayTeamName: "KuPS",
    homeGoals: 2,
    awayGoals: 1,
    ...overrides,
  };
}

async function renderTeam(
  id: string,
  searchParams: Record<string, string | string[] | undefined> = {}
) {
  const { default: DomesticTeamPage } = await import("@/app/domestic/team/[id]/page");
  render(
    await DomesticTeamPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(searchParams),
    })
  );
}

describe("Domestic team page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTeamMatchesMock.mockResolvedValue({ status: "ok", matches: [buildMatch()] });
  });

  it("shows the team's name in the heading, alongside the competition and season", async () => {
    await renderTeam("1");

    expect(screen.getByRole("heading", { name: "HJK – Veikkausliiga 2026" })).toBeInTheDocument();
    expect(getTeamMatchesMock).toHaveBeenCalledWith("VL", "spljp26", 1, 2026, 2026);
  });

  it("resolves the team as the away side too", async () => {
    await renderTeam("2");

    expect(screen.getByRole("heading", { name: "KuPS – Veikkausliiga 2026" })).toBeInTheDocument();
  });

  it("shows every match's date, teams, result, and group name", async () => {
    await renderTeam("1");

    expect(screen.getByText("01.04.2026")).toBeInTheDocument();
    expect(screen.getByText("HJK – KuPS")).toBeInTheDocument();
    expect(screen.getByText("2–1")).toBeInTheDocument();
    expect(screen.getByText("Runkosarja")).toBeInTheDocument();
  });

  it("links back to the standings page", async () => {
    await renderTeam("1", { kausi: "2020" });

    expect(screen.getByRole("link", { name: "Sarjataulukkoon" })).toHaveAttribute(
      "href",
      "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2020"
    );
  });

  it("shows the not-found message for a team that never appears in the season", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "not_found" });

    await renderTeam("999");

    expect(screen.getByText("Joukkuetta ei löytynyt.")).toBeInTheDocument();
  });

  it("shows the not-found message for a non-numeric id, without calling getTeamMatches", async () => {
    await renderTeam("not-a-number");

    expect(screen.getByText("Joukkuetta ei löytynyt.")).toBeInTheDocument();
    expect(getTeamMatchesMock).not.toHaveBeenCalled();
  });

  it("shows the empty message when the season truly has no matches", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "empty" });

    await renderTeam("1");

    expect(screen.getByText("Otteluita ei ole saatavilla.")).toBeInTheDocument();
  });

  it("shows the error message on a TASO failure", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "error" });

    await renderTeam("1");

    expect(
      screen.getByText("Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
  });

  it("shows a dash for an unplayed match's result", async () => {
    getTeamMatchesMock.mockResolvedValue({
      status: "ok",
      matches: [buildMatch({ homeGoals: null, awayGoals: null, status: "SCHEDULED" })],
    });

    await renderTeam("1");

    const cells = screen.getAllByRole("cell");
    expect(cells[2]).toHaveTextContent("–");
  });

  it("shows fallback notices for invalid kilpailu and kausi params", async () => {
    await renderTeam("1", { kilpailu: "XX", kausi: "1999" });

    const notices = screen.getAllByRole("status");
    expect(notices.map((notice) => notice.textContent)).toEqual([
      "Kilpailua ei löytynyt. Näytetään Veikkausliiga.",
      "Kautta ei löytynyt. Näytetään kausi 2026.",
    ]);
  });

  it("defaults searchParams handling when none is provided", async () => {
    const { default: DomesticTeamPage } = await import("@/app/domestic/team/[id]/page");
    render(await DomesticTeamPage({ params: Promise.resolve({ id: "1" }) }));

    expect(screen.getByRole("heading", { name: "HJK – Veikkausliiga 2026" })).toBeInTheDocument();
  });

  it("sets the browser tab title to the team's name", async () => {
    const { generateMetadata } = await import("@/app/domestic/team/[id]/page");

    expect(
      await generateMetadata({
        params: Promise.resolve({ id: "1" }),
        searchParams: Promise.resolve({}),
      })
    ).toEqual({ title: "HJK – Veikkausliiga 2026" });
  });

  it("sets the tab title to just the competition name before a team is resolved", async () => {
    getTeamMatchesMock.mockResolvedValue({ status: "not_found" });
    const { generateMetadata } = await import("@/app/domestic/team/[id]/page");

    expect(
      await generateMetadata({
        params: Promise.resolve({ id: "999" }),
        searchParams: Promise.resolve({}),
      })
    ).toEqual({ title: "Veikkausliiga" });
  });

  it("sets the tab title to just the competition name for a non-numeric id, without calling getTeamMatches", async () => {
    const { generateMetadata } = await import("@/app/domestic/team/[id]/page");

    expect(
      await generateMetadata({
        params: Promise.resolve({ id: "not-a-number" }),
        searchParams: Promise.resolve({}),
      })
    ).toEqual({ title: "Veikkausliiga" });
    expect(getTeamMatchesMock).not.toHaveBeenCalled();
  });

  it("defaults tab title searchParams handling when none is provided", async () => {
    const { generateMetadata } = await import("@/app/domestic/team/[id]/page");

    expect(await generateMetadata({ params: Promise.resolve({ id: "1" }) })).toEqual({
      title: "HJK – Veikkausliiga 2026",
    });
  });
});
