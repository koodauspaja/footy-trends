import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Loading from "@/app/loading";
import type { StandingsResult } from "@/lib/standings-service";

const getPremierLeagueStandingsMock = vi.fn<() => Promise<StandingsResult>>();

vi.mock("@/lib/standings-service", () => ({
  getPremierLeagueStandings: getPremierLeagueStandingsMock,
}));

async function renderHome() {
  const { default: Home } = await import("@/app/page");
  render(await Home());
}

describe("Home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("shows the Finnish heading, column labels, and calculated standings", async () => {
    getPremierLeagueStandingsMock.mockResolvedValue({
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
    });

    await renderHome();

    expect(screen.getByRole("heading", { name: "Valioliigan sarjataulukko" })).toBeInTheDocument();
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

  it("shows the Finnish empty-state message when no standings are available", async () => {
    getPremierLeagueStandingsMock.mockResolvedValue({ status: "empty", standings: [] });

    await renderHome();

    expect(screen.getByText("Sarjataulukkoa ei ole saatavilla.")).toBeInTheDocument();
  });

  it("shows the Finnish error message when standings cannot be loaded", async () => {
    getPremierLeagueStandingsMock.mockResolvedValue({ status: "error", standings: [] });

    await renderHome();

    expect(
      screen.getByText("Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
  });
});

describe("Loading state", () => {
  it("shows the Finnish loading message", () => {
    render(<Loading />);

    expect(screen.getByText("Ladataan sarjataulukkoa...")).toBeInTheDocument();
  });
});
