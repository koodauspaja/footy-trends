import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchPageData, TasoMatchRow } from "@/lib/match-service";
import { warmModules } from "../../../../../support/warm-module";

const getMatchPageDataMock = vi.fn<() => Promise<MatchPageData>>();
/** The link to the full history asks how many meetings there are (specs/042). */
const countHeadToHeadHistoryMock = vi.fn<() => Promise<number | null>>(async () => 24);

vi.mock("@/lib/match-service", () => ({
  getMatchPageData: getMatchPageDataMock,
  countHeadToHeadHistory: countHeadToHeadHistoryMock,
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
    halfTimeHome: null,
    halfTimeAway: null,
    createdAt: new Date("2026-08-31T18:00:00Z"),
    updatedAt: new Date("2026-08-31T18:00:00Z"),
    ...overrides,
  };
}

async function renderPage(id = "4036979") {
  const { default: Page } = await import("@/app/domestic/match/[id]/page");
  render(await Page({ params: Promise.resolve({ id }) }));
}

warmModules(() => import("@/app/domestic/match/[id]/page"));

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
            halfTimeHome: null,
            halfTimeAway: null,
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

  it("names each previous meeting's competition rather than TASO's series", async () => {
    // The list spans competitions, so this column is the only signal for which
    // one a meeting belonged to: "5. Kierros" left a cup tie looking like a
    // league round. See #251.
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: { source: "taso", match: tasoRow() },
      headToHead: {
        status: "ok",
        matches: [
          tasoRow({
            providerMatchId: 4000002,
            categoryId: "MSC",
            groupName: "5. Kierros",
            kickoffAt: new Date("2026-05-30T15:00:00Z"),
          }),
          tasoRow({
            providerMatchId: 4000003,
            categoryId: "VL",
            groupName: "Runkosarja",
            kickoffAt: new Date("2026-04-05T15:00:00Z"),
          }),
        ],
      },
    });
    await renderPage();

    expect(screen.getByRole("columnheader", { name: "Kilpailu" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Sarja" })).not.toBeInTheDocument();
    expect(screen.getByText("Miesten Suomen Cup")).toBeInTheDocument();
    expect(screen.getByText("Veikkausliiga")).toBeInTheDocument();
    expect(screen.queryByText("5. Kierros")).not.toBeInTheDocument();
  });

  it("falls back to the series name for a category the picker does not claim", async () => {
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: { source: "taso", match: tasoRow() },
      headToHead: {
        status: "ok",
        matches: [tasoRow({ providerMatchId: 4000004, categoryId: "X99", groupName: "Lohko A" })],
      },
    });
    await renderPage();

    expect(screen.getByText("Lohko A")).toBeInTheDocument();
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

  it("shows plain team names for a category the registry does not claim", async () => {
    // TASO publishes 28 categories in spljp26 and the picker registers 20, so a
    // row can carry a category with no competition behind it: no team page to
    // link to, no competition to name, and the series name left to carry it.
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: { source: "taso", match: tasoRow({ categoryId: "X99" }) },
      headToHead: { status: "ok", matches: [] },
    });
    await renderPage();

    expect(screen.queryByRole("link", { name: "VPS" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Veikkausliiga/)).not.toBeInTheDocument();
    expect(screen.getByText("Mestaruussarja")).toBeInTheDocument();
  });

  it("never links a placeholder team, whose page could not exist", async () => {
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: {
        source: "taso",
        match: tasoRow({ homeTeamProviderId: 0, homeTeamName: "" }),
      },
      headToHead: { status: "unavailable" },
    });
    await renderPage();

    expect(screen.queryByRole("link", { name: "Tuntematon joukkue" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "FC Lahti" })).toBeInTheDocument();
  });

  it("titles a page with no match after the not-found message", async () => {
    getMatchPageDataMock.mockResolvedValue({ status: "not_found" });
    const { generateMetadata } = await import("@/app/domestic/match/[id]/page");

    expect(await generateMetadata({ params: Promise.resolve({ id: "999999999" }) })).toEqual({
      title: "Ottelua ei löytynyt.",
    });
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

describe("the link to the full history (specs/042)", () => {
  /**
   * Its own setup: this block is a sibling of the one above, so its
   * `beforeEach` does not run here — and without this, a shuffled run inherits
   * whichever fixture the previous test left behind. It did: the placeholder
   * match leaked in and the link vanished for the wrong reason.
   */
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: { source: "taso", match: tasoRow() },
      headToHead: { status: "ok", matches: [] },
    });
    countHeadToHeadHistoryMock.mockResolvedValue(24);
  });

  it("carries the number of meetings the page behind it will show", async () => {
    await renderPage();

    const link = screen.getByRole("link", { name: "Kaikki kohtaamiset (24)" });
    expect(link).toBeInTheDocument();
  });

  it("points at this region's pairing, by the two teams' provider ids", async () => {
    await renderPage();

    const link = screen.getByRole("link", { name: /Kaikki kohtaamiset/ });
    expect(link.getAttribute("href")).toMatch(/^\/kotimaa\/kohtaamiset\/\d+\/\d+$/);
  });

  it("is absent for an unresolved bracket slot, which has no pair to open", async () => {
    // The block above already says the meetings cannot be shown; offering a
    // link to a page about a team that does not exist yet says the opposite.
    getMatchPageDataMock.mockResolvedValue({
      status: "ok",
      match: { source: "taso", match: tasoRow({ homeTeamProviderId: 0, homeTeamName: "" }) },
      headToHead: { status: "unavailable" },
    });
    await renderPage();

    expect(screen.queryByRole("link", { name: /Kaikki kohtaamiset/ })).not.toBeInTheDocument();
    expect(countHeadToHeadHistoryMock).not.toHaveBeenCalled();
  });

  it("is absent when the count could not be read", async () => {
    // A failed read is not zero meetings, and a link promising a number it
    // does not have is worse than no link.
    countHeadToHeadHistoryMock.mockResolvedValue(null);
    await renderPage();

    expect(screen.queryByRole("link", { name: /Kaikki kohtaamiset/ })).not.toBeInTheDocument();
  });

  it("is absent when the pair has no stored meeting", async () => {
    // A link to an empty page is worse than no link.
    countHeadToHeadHistoryMock.mockResolvedValue(0);
    await renderPage();

    expect(screen.queryByRole("link", { name: /Kaikki kohtaamiset/ })).not.toBeInTheDocument();
  });
});
