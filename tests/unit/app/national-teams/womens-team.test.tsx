import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NationalTeamResult, NationalTeamYear } from "@/lib/national-team-service";

const getNationalTeamYearsMock = vi.fn<() => Promise<NationalTeamResult>>();

vi.mock("@/lib/national-team-service", () => ({
  getNationalTeamYears: getNationalTeamYearsMock,
}));

function match(providerMatchId: number, competitionName: string, played: boolean) {
  return {
    providerMatchId,
    competitionCode: "maajp2026",
    categoryId: "WWCQ",
    seasonId: 2026,
    groupId: 1,
    groupName: "",
    status: played ? "FINISHED" : "SCHEDULED",
    kickoffAt: new Date("2026-09-26T19:00:00Z"),
    matchday: null,
    homeTeamProviderId: 1,
    homeTeamName: "Ruotsi",
    awayTeamProviderId: 2,
    awayTeamName: "Suomi",
    homeGoals: played ? 0 : null,
    awayGoals: played ? 3 : null,
    winner: null,
    competitionName,
  };
}

function year(y: number, matches: ReturnType<typeof match>[]): NationalTeamYear {
  return { year: y, matches } as NationalTeamYear;
}

async function renderPage() {
  const { default: Page } = await import("@/app/national-teams/womens-team/page");
  render(await Page());
}

describe("Helmarit page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getNationalTeamYearsMock.mockResolvedValue({
      status: "ok",
      incomplete: false,
      years: [year(2026, [match(1, "MM-karsinnat", true)])],
    });
  });

  it("is headed by the team, with no year — the page is every year", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Helmarit" })).toBeInTheDocument();
  });

  it("shows a row's competition, teams and result", async () => {
    await renderPage();

    expect(screen.getByRole("columnheader", { name: "Kilpailu" })).toBeInTheDocument();
    expect(screen.getByText("MM-karsinnat")).toBeInTheDocument();
    expect(screen.getByText("Ruotsi – Suomi")).toBeInTheDocument();
    expect(screen.getByText("0–3")).toBeInTheDocument();
  });

  it("offers no season or competition selector", async () => {
    await renderPage();

    expect(screen.queryByLabelText("Kausi")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Kilpailu")).not.toBeInTheDocument();
  });

  it("shows an unplayed match without a score rather than as 0–0", async () => {
    getNationalTeamYearsMock.mockResolvedValue({
      status: "ok",
      incomplete: false,
      years: [year(2026, [match(1, "MM-karsinnat", false)])],
    });

    await renderPage();

    expect(screen.queryByText("0–0")).not.toBeInTheDocument();
    expect(screen.getByText("Ruotsi – Suomi")).toBeInTheDocument();
  });

  it("puts each year in a section that starts open", async () => {
    getNationalTeamYearsMock.mockResolvedValue({
      status: "ok",
      incomplete: false,
      years: [
        year(2026, [match(1, "MM-karsinnat", true)]),
        year(2021, [match(2, "EM-lopputurnaus", true)]),
      ],
    });

    await renderPage();

    const sections = document.querySelectorAll("details");
    expect(sections).toHaveLength(2);
    for (const section of sections) expect(section).toHaveAttribute("open");
  });

  it("summarises a year by its match count", async () => {
    getNationalTeamYearsMock.mockResolvedValue({
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
    getNationalTeamYearsMock.mockResolvedValue({
      status: "ok",
      incomplete: false,
      years: [
        year(2026, [match(1, "MM-karsinnat", true)]),
        year(2021, [match(2, "EM-lopputurnaus", true)]),
      ],
    });

    await renderPage();

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["2026", "2021"]);
  });

  it("warns in Finnish when some of the history could not be loaded", async () => {
    getNationalTeamYearsMock.mockResolvedValue({
      status: "ok",
      incomplete: true,
      years: [year(2026, [match(1, "MM-karsinnat", true)])],
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
    getNationalTeamYearsMock.mockResolvedValue({ status: "empty" });

    await renderPage();

    expect(screen.getByText("Otteluita ei ole saatavilla.")).toBeInTheDocument();
    expect(document.querySelectorAll("details")).toHaveLength(0);
  });

  it("shows the Finnish error message rather than a page missing a year", async () => {
    getNationalTeamYearsMock.mockResolvedValue({ status: "error" });

    await renderPage();

    expect(
      screen.getByText("Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(document.querySelectorAll("details")).toHaveLength(0);
  });

  /**
   * The bug in #182. This page takes no `searchParams`, so nothing makes it
   * dynamic implicitly the way every other data-backed page is. Next
   * prerendered it, the build container could not resolve
   * `postgres.railway.internal` — Railway's private network is runtime-only —
   * and the error page was baked into the static output and served to
   * everyone.
   */
  it("is rendered per request, never prerendered", async () => {
    const { dynamic } = await import("@/app/national-teams/womens-team/page");

    expect(dynamic).toBe("force-dynamic");
  });

  it("titles the browser tab with the team", async () => {
    const { metadata } = await import("@/app/national-teams/womens-team/page");

    expect(metadata.title).toBe("Helmarit");
  });
});
