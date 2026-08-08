import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Loading from "@/app/loading";
import type { SeasonContext } from "@/lib/football-data";
import type { StandingsResult } from "@/lib/standings-service";

const getPremierLeagueStandingsMock = vi.fn<() => Promise<StandingsResult>>();
const getSeasonContextMock = vi.fn<() => Promise<SeasonContext>>();

vi.mock("@/lib/standings-service", () => ({
  getPremierLeagueStandings: getPremierLeagueStandingsMock,
}));

vi.mock("@/lib/football-data", () => ({
  getSeasonContext: getSeasonContextMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const seasonContext: SeasonContext = {
  activeSeasonId: 2025,
  selectableSeasons: [
    { seasonId: 2025, label: "2025/26" },
    { seasonId: 2024, label: "2024/25" },
    { seasonId: 2023, label: "2023/24" },
  ],
};

const standings: StandingsResult = {
  status: "ok",
  standings: [
    {
      position: 1,
      teamProviderId: 1,
      teamName: "Arsenal FC",
      played: 3,
      won: 2,
      drawn: 1,
      lost: 0,
      goalsFor: 5,
      goalsAgainst: 2,
      goalDifference: 3,
      points: 7,
      form: [
        { matchId: 1, result: "V", label: "Voitto" },
        { matchId: 2, result: "T", label: "Tasapeli" },
      ],
    },
  ],
};

async function renderHome(searchParams: Record<string, string | string[] | undefined> = {}) {
  const { default: Home } = await import("@/app/page");
  render(await Home({ searchParams: Promise.resolve(searchParams) }));
}

describe("Home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getSeasonContextMock.mockResolvedValue(seasonContext);
    getPremierLeagueStandingsMock.mockResolvedValue(standings);
  });

  it("shows the Finnish heading, column labels, and calculated standings", async () => {
    await renderHome();

    expect(
      screen.getByRole("heading", { name: "Valioliigan sarjataulukko 2025/26" })
    ).toBeInTheDocument();
    expect(screen.getByTitle("Ottelut")).toBeInTheDocument();
    expect(screen.getByTitle("Voitot")).toBeInTheDocument();
    expect(screen.getByTitle("Tasapelit")).toBeInTheDocument();
    expect(screen.getByTitle("Häviöt")).toBeInTheDocument();
    expect(screen.getByText("Arsenal FC")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByLabelText("Voitto, Tasapeli")).toBeInTheDocument();
    expect(
      screen.getByText(
        "O = ottelut, V = voitot, T = tasapelit, H = häviöt, TM = tehdyt maalit, PM = päästetyt maalit, ME = maaliero, P = pisteet."
      )
    ).toBeInTheDocument();
  });

  it("defaults to the active season without a kausi parameter", async () => {
    await renderHome();

    expect(getPremierLeagueStandingsMock).toHaveBeenCalledWith({
      seasonId: 2025,
      activeSeasonId: 2025,
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("defaults to the active season when searchParams is not provided", async () => {
    const { default: Home } = await import("@/app/page");
    render(await Home({}));

    expect(getPremierLeagueStandingsMock).toHaveBeenCalledWith({
      seasonId: 2025,
      activeSeasonId: 2025,
    });
  });

  it("shows the season named by a valid kausi parameter", async () => {
    await renderHome({ kausi: "2023" });

    expect(getPremierLeagueStandingsMock).toHaveBeenCalledWith({
      seasonId: 2023,
      activeSeasonId: 2025,
    });
    expect(
      screen.getByRole("heading", { name: "Valioliigan sarjataulukko 2023/24" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Kausi")).toHaveValue("2023");
  });

  it("falls back to the active season for an unselectable kausi parameter", async () => {
    await renderHome({ kausi: "1999" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kautta ei löytynyt. Näytetään kausi 2025/26."
    );
    expect(getPremierLeagueStandingsMock).toHaveBeenCalledWith({
      seasonId: 2025,
      activeSeasonId: 2025,
    });
  });

  it("falls back to the active season for a non-numeric kausi parameter", async () => {
    await renderHome({ kausi: "abc" });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Kautta ei löytynyt. Näytetään kausi 2025/26."
    );
  });

  it("does not show the fallback notice for a valid season", async () => {
    await renderHome({ kausi: "2024" });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps the season selector visible in the empty state", async () => {
    getPremierLeagueStandingsMock.mockResolvedValue({ status: "empty", standings: [] });

    await renderHome();

    expect(screen.getByText("Sarjataulukkoa ei ole saatavilla.")).toBeInTheDocument();
    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
  });

  it("keeps the season selector visible in the error state", async () => {
    getPremierLeagueStandingsMock.mockResolvedValue({ status: "error", standings: [] });

    await renderHome();

    expect(
      screen.getByText("Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Kausi")).toBeInTheDocument();
  });

  it("shows the error message when the selectable seasons cannot be resolved", async () => {
    getSeasonContextMock.mockRejectedValue(new Error("provider unavailable"));

    await renderHome();

    expect(
      screen.getByText("Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Kausi")).not.toBeInTheDocument();
    expect(getPremierLeagueStandingsMock).not.toHaveBeenCalled();
  });
});

describe("Loading state", () => {
  it("shows the Finnish loading message", () => {
    render(<Loading />);

    expect(screen.getByText("Ladataan sarjataulukkoa...")).toBeInTheDocument();
  });
});
