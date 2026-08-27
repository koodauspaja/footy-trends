import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MensTeamResult, MensTeamYear } from "@/lib/mens-team-service";

const getMensTeamYearsMock = vi.fn<() => Promise<MensTeamResult>>();

vi.mock("@/lib/mens-team-service", () => ({ getMensTeamYears: getMensTeamYearsMock }));

function match(providerMatchId: number, competitionName: string, played: boolean) {
  return {
    providerMatchId,
    competitionCode: "maajp2026",
    categoryId: "UNL",
    seasonId: 2026,
    groupId: 1,
    groupName: "C-liiga lohko 1",
    status: played ? "FINISHED" : "SCHEDULED",
    kickoffAt: new Date("2026-09-26T19:00:00Z"),
    matchday: null,
    homeTeamProviderId: 1,
    homeTeamName: "San Marino",
    awayTeamProviderId: 2,
    awayTeamName: "Suomi",
    homeGoals: played ? 0 : null,
    awayGoals: played ? 3 : null,
    winner: null,
    competitionName,
  };
}

function year(y: number, matches: ReturnType<typeof match>[]): MensTeamYear {
  return { year: y, matches } as MensTeamYear;
}

async function renderPage() {
  const { default: Page } = await import("@/app/national-teams/mens-team/page");
  render(await Page());
}

describe("Huuhkajat page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getMensTeamYearsMock.mockResolvedValue({
      status: "ok",
      incomplete: false,
      years: [year(2026, [match(1, "UEFA Nations League", true)])],
    });
  });

  it("is headed by the team, with no year — the page is every year", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Huuhkajat" })).toBeInTheDocument();
  });

  it("shows a row's competition, teams and result", async () => {
    await renderPage();

    expect(screen.getByRole("columnheader", { name: "Kilpailu" })).toBeInTheDocument();
    expect(screen.getByText("UEFA Nations League")).toBeInTheDocument();
    expect(screen.getByText("San Marino – Suomi")).toBeInTheDocument();
    expect(screen.getByText("0–3")).toBeInTheDocument();
  });

  it("offers no season or competition selector", async () => {
    await renderPage();

    expect(screen.queryByLabelText("Kausi")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Kilpailu")).not.toBeInTheDocument();
  });

  it("shows an unplayed match without a score rather than as 0–0", async () => {
    getMensTeamYearsMock.mockResolvedValue({
      status: "ok",
      incomplete: false,
      years: [year(2026, [match(1, "UEFA Nations League", false)])],
    });

    await renderPage();

    expect(screen.queryByText("0–0")).not.toBeInTheDocument();
    expect(screen.getByText("San Marino – Suomi")).toBeInTheDocument();
  });

  it("puts each year in a section that starts open", async () => {
    getMensTeamYearsMock.mockResolvedValue({
      status: "ok",
      incomplete: false,
      years: [
        year(2026, [match(1, "UEFA Nations League", true)]),
        year(2021, [match(2, "EM-lopputurnaus", true)]),
      ],
    });

    await renderPage();

    const sections = document.querySelectorAll("details");
    expect(sections).toHaveLength(2);
    for (const section of sections) expect(section).toHaveAttribute("open");
  });

  it("summarises a year by its match count", async () => {
    getMensTeamYearsMock.mockResolvedValue({
      status: "ok",
      incomplete: false,
      years: [
        year(
          2023,
          Array.from({ length: 12 }, (_, index) => match(index, "EM-karsinnat", true))
        ),
      ],
    });

    await renderPage();

    expect(screen.getByRole("heading", { level: 2, name: "2023" })).toBeInTheDocument();
    expect(screen.getByText("(12 ottelua)")).toBeInTheDocument();
  });

  it("uses the singular for a year with one match", async () => {
    await renderPage();

    expect(screen.getByText("(1 ottelu)")).toBeInTheDocument();
  });

  it("keeps the years in the order the service returns them", async () => {
    getMensTeamYearsMock.mockResolvedValue({
      status: "ok",
      incomplete: false,
      years: [
        year(2026, [match(1, "UEFA Nations League", true)]),
        year(2021, [match(2, "EM-lopputurnaus", true)]),
      ],
    });

    await renderPage();

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["2026", "2021"]);
  });

  it("warns in Finnish when some of the history could not be loaded", async () => {
    getMensTeamYearsMock.mockResolvedValue({
      status: "ok",
      incomplete: true,
      years: [year(2026, [match(1, "UEFA Nations League", true)])],
    });

    await renderPage();

    // The years that loaded still render — the point of #180.
    expect(document.querySelectorAll("details")).toHaveLength(1);
    expect(
      screen.getByText("Kaikkia otteluita ei voitu ladata. Osa kausista voi puuttua.")
    ).toBeInTheDocument();
  });

  it("shows no warning when the whole history loaded", async () => {
    await renderPage();

    expect(screen.queryByText(/Kaikkia otteluita ei voitu ladata/)).not.toBeInTheDocument();
  });

  it("shows the Finnish empty message when there is nothing to list", async () => {
    getMensTeamYearsMock.mockResolvedValue({ status: "empty" });

    await renderPage();

    expect(screen.getByText("Otteluita ei ole saatavilla.")).toBeInTheDocument();
    expect(document.querySelectorAll("details")).toHaveLength(0);
  });

  it("shows the Finnish error message rather than a page missing a year", async () => {
    getMensTeamYearsMock.mockResolvedValue({ status: "error" });

    await renderPage();

    expect(
      screen.getByText("Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(document.querySelectorAll("details")).toHaveLength(0);
  });

  it("titles the browser tab with the team", async () => {
    const { metadata } = await import("@/app/national-teams/mens-team/page");

    expect(metadata.title).toBe("Huuhkajat");
  });
});
