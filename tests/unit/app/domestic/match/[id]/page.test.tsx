import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchPageData, TasoMatchRow } from "@/lib/match-service";

const getMatchPageDataMock = vi.fn<() => Promise<MatchPageData>>();

vi.mock("@/lib/match-service", () => ({
  getMatchPageData: getMatchPageDataMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

function tasoRow(overrides: Partial<TasoMatchRow> = {}): TasoMatchRow {
  return {
    id: 1,
    providerMatchId: 4036979,
    competitionCode: "spljp26",
    categoryId: "VL",
    seasonId: 2026,
    groupId: 1,
    groupName: "Mestaruussarja",
    kickoffAt: new Date("2026-08-31T16:00:00Z"),
    matchday: 24,
    status: "FINISHED",
    winner: null,
    homeTeamProviderId: 60901,
    homeTeamName: "VPS",
    awayTeamProviderId: 60969,
    awayTeamName: "FC Lahti",
    homeGoals: 2,
    awayGoals: 1,
    createdAt: new Date("2026-08-31T18:00:00Z"),
    updatedAt: new Date("2026-08-31T18:00:00Z"),
    ...overrides,
  };
}

async function renderPage(id = "4036979") {
  const { default: Page } = await import("@/app/domestic/match/[id]/page");
  render(await Page({ params: Promise.resolve({ id }) }));
}

describe("/kotimaa/ottelu/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: { source: "taso", match: tasoRow() },
      headToHead: {
        status: "ok",
        matches: [
          tasoRow({
            providerMatchId: 4000001,
            kickoffAt: new Date("2026-05-04T15:00:00Z"),
            groupName: "Runkosarja",
            homeGoals: 0,
            awayGoals: 0,
          }),
        ],
      },
    });
  });

  it("is headed by the two teams", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "VPS – FC Lahti" })).toBeInTheDocument();
  });

  it("shows the kickoff with its time, the competition, the series and the round", async () => {
    await renderPage();

    expect(screen.getByText("31.08.2026 klo 19.00")).toBeInTheDocument();
    expect(screen.getByText("Veikkausliiga 2026")).toBeInTheDocument();
    expect(screen.getByText("Mestaruussarja")).toBeInTheDocument();
    expect(screen.getByText("Kierros 24")).toBeInTheDocument();
  });

  it("links both teams to their team pages, carrying the competition and season", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: "VPS" })).toHaveAttribute(
      "href",
      "/kotimaa/joukkue/60901?kilpailu=VL&kausi=2026"
    );
    expect(screen.getByRole("link", { name: "FC Lahti" })).toHaveAttribute(
      "href",
      "/kotimaa/joukkue/60969?kilpailu=VL&kausi=2026"
    );
  });

  it("lists previous meetings, each linking to its own match page", async () => {
    await renderPage();

    expect(
      screen.getByRole("heading", { level: 2, name: "Aiemmat kohtaamiset" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "04.05.2026" })).toHaveAttribute(
      "href",
      "/kotimaa/ottelu/4000001"
    );
  });

  it("states the window the meetings were drawn from", async () => {
    await renderPage();

    expect(
      screen.getByText("Perustuu kaudesta 2015 alkaen tallennettuihin otteluihin.")
    ).toBeInTheDocument();
  });

  it("keeps the window sentence when there are no meetings at all", async () => {
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: { source: "taso", match: tasoRow() },
      headToHead: { status: "ok", matches: [] },
    });
    await renderPage();

    expect(screen.getByText("Aiempia kohtaamisia ei löytynyt.")).toBeInTheDocument();
    expect(
      screen.getByText("Perustuu kaudesta 2015 alkaen tallennettuihin otteluihin.")
    ).toBeInTheDocument();
  });

  it("names TASO's winner in bold when the score is level", async () => {
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: {
        source: "taso",
        match: tasoRow({ homeGoals: 1, awayGoals: 1, winner: "away", categoryId: "MSC" }),
      },
      headToHead: { status: "ok", matches: [] },
    });
    await renderPage();

    // No "(rp)" — TASO never itemises the shootout it was settled on.
    expect(screen.getByText("1–1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "FC Lahti" })).toHaveClass("font-semibold");
  });

  it("shows no head-to-head for a match with an unresolved bracket slot", async () => {
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: {
        source: "taso",
        match: tasoRow({ homeTeamProviderId: 0, homeTeamName: "" }),
      },
      headToHead: { status: "unavailable" },
    });
    await renderPage();

    expect(
      screen.getByText(
        "Aiempia kohtaamisia ei voida näyttää, koska toista joukkuetta ei tunnisteta."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Tuntematon joukkue – FC Lahti"
    );
  });

  it("still renders the match when the head-to-head query fails", async () => {
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: { source: "taso", match: tasoRow() },
      headToHead: { status: "error" },
    });
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "VPS – FC Lahti" })).toBeInTheDocument();
    expect(screen.getByText("Aiempien kohtaamisten lataaminen epäonnistui.")).toBeInTheDocument();
  });

  it("shows the Finnish not-found state for an unknown id", async () => {
    getMatchPageDataMock.mockResolvedValue({ status: "not_found" });
    await renderPage("999999999");

    expect(screen.getByText("Ottelua ei löytynyt.")).toBeInTheDocument();
  });

  it("shows the not-found state for a malformed id, without querying", async () => {
    await renderPage("abc");

    expect(getMatchPageDataMock).not.toHaveBeenCalled();
    expect(screen.getByText("Ottelua ei löytynyt.")).toBeInTheDocument();
  });

  it("shows the error state when the match cannot be read", async () => {
    getMatchPageDataMock.mockResolvedValue({ status: "error" });
    await renderPage();

    expect(
      screen.getByText("Ottelun lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
  });

  it("titles the page with the teams and the competition", async () => {
    const { generateMetadata } = await import("@/app/domestic/match/[id]/page");

    expect(await generateMetadata({ params: Promise.resolve({ id: "4036979" }) })).toEqual({
      title: "VPS – FC Lahti, Veikkausliiga 2026",
    });
  });
});
