import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FootballDataMatchRow, HeadToHeadResult, TasoMatchRow } from "@/lib/match-service";
import { MENS_TEAM } from "@/lib/national-team";

/**
 * The full head-to-head page (specs/042): what it asks for, and what it puts on
 * screen.
 *
 * The record's arithmetic is `head-to-head.test.ts`'s and the row labels are
 * `meeting-labels`', so what this file owns is the page — its two sections, the
 * ids it resolves, and the cases where there is nothing to show.
 */

const getHeadToHeadHistoryMock = vi.fn<() => Promise<HeadToHeadResult>>();

vi.mock("@/lib/match-service", () => ({
  getHeadToHeadHistory: getHeadToHeadHistoryMock,
}));

vi.mock("@/lib/taso-standings-service", () => ({
  getSeasonCategoryNameMap: vi.fn(async () => null),
}));

import { warmModules } from "../../support/warm-module";

const HJK = 1;
const KUPS = 2;

function meeting(over: Partial<TasoMatchRow> & { providerMatchId: number }): TasoMatchRow {
  return {
    id: over.providerMatchId,
    competitionCode: "spljp25",
    categoryId: "VL",
    seasonId: 2025,
    groupId: 1,
    groupName: "Runkosarja",
    status: "FINISHED",
    kickoffAt: new Date("2025-07-12T16:00:00Z"),
    matchday: 12,
    homeTeamProviderId: HJK,
    homeTeamName: "HJK",
    awayTeamProviderId: KUPS,
    awayTeamName: "KuPS",
    homeGoals: 2,
    awayGoals: 1,
    halfTimeHome: 1,
    halfTimeAway: 0,
    winner: "home",
    updatedAt: new Date("2025-07-13T00:00:00Z"),
    ...over,
  } as TasoMatchRow;
}

const ROUTE = {
  source: { kind: "taso", bucket: "domestic" },
  basePath: "/kotimaa",
} as const;

async function renderPage(a = String(HJK), b = String(KUPS)) {
  // Imported here rather than at the top: a static import is hoisted above the
  // mock factory, which would then read a `vi.fn` that does not exist yet.
  const { HeadToHeadPage } = await import("@/components/head-to-head-page");
  render(await HeadToHeadPage({ ...ROUTE, params: Promise.resolve({ a, b }) }));
}

warmModules(() => import("@/components/head-to-head-page"));

describe("HeadToHeadPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [
        meeting({ providerMatchId: 1 }),
        meeting({
          providerMatchId: 2,
          kickoffAt: new Date("2024-05-03T16:00:00Z"),
          seasonId: 2024,
          homeTeamProviderId: KUPS,
          homeTeamName: "KuPS",
          awayTeamProviderId: HJK,
          awayTeamName: "HJK",
          homeGoals: 0,
          awayGoals: 0,
          winner: "tie",
        }),
      ],
    });
  });

  it("asks for the pair the URL names, in that order", async () => {
    await renderPage();

    expect(getHeadToHeadHistoryMock).toHaveBeenCalledWith(ROUTE.source, HJK, KUPS);
  });

  it("heads the page with both teams", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Kohtaamiset: HJK – KuPS");
  });

  it("reads Yhteenveto then Kohtaamiset, in that order", async () => {
    await renderPage();

    const sections = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(sections).toEqual(["Yhteenveto", "Kohtaamiset"]);
  });

  it("summarises the record, the goals and each ground", async () => {
    await renderPage();

    // One win and one draw, from HJK's side; HJK hosted the win, KuPS the draw.
    expect(screen.getByText("2 ottelua, 2024–2025")).toBeInTheDocument();
    expect(screen.getByText("HJK 1 – 1 tasan – 0 KuPS")).toBeInTheDocument();
    expect(screen.getByText("Maalit 2 – 1")).toBeInTheDocument();
    expect(screen.getByText("HJK kotona 1 – 0 – 0")).toBeInTheDocument();
    expect(screen.getByText("KuPS kotona 0 – 1 – 0")).toBeInTheDocument();
  });

  it("reads the record the other way when the ids are swapped", async () => {
    await renderPage(String(KUPS), String(HJK));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Kohtaamiset: KuPS – HJK");
    expect(screen.getByText("KuPS 0 – 1 tasan – 1 HJK")).toBeInTheDocument();
  });

  it("lists every meeting, each linking to its own match page", async () => {
    await renderPage();

    const links = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(links).toContain("/kotimaa/ottelu/1");
    expect(links).toContain("/kotimaa/ottelu/2");
  });

  it("shows the window sentence, so a count reads as ours rather than theirs", async () => {
    await renderPage();

    expect(
      screen.getByText(/Perustuu kaudesta .* alkaen tallennettuihin otteluihin\./)
    ).toBeInTheDocument();
  });

  it("is not found for a team against itself", async () => {
    await renderPage(String(HJK), String(HJK));

    expect(screen.getByText("Kohtaamisia ei löytynyt.")).toBeInTheDocument();
    expect(getHeadToHeadHistoryMock).not.toHaveBeenCalled();
  });

  it("is not found for an id that is not a stored integer", async () => {
    await renderPage("abc", String(KUPS));

    expect(screen.getByText("Kohtaamisia ei löytynyt.")).toBeInTheDocument();
    expect(getHeadToHeadHistoryMock).not.toHaveBeenCalled();
  });

  it("is not found when the pair has never met", async () => {
    // Reached only from a match page, so an empty history is a hand-typed URL.
    getHeadToHeadHistoryMock.mockResolvedValue({ status: "ok", matches: [] });
    await renderPage();

    expect(screen.getByText("Kohtaamisia ei löytynyt.")).toBeInTheDocument();
  });

  it("is not found when a placeholder team makes the pair unidentifiable", async () => {
    getHeadToHeadHistoryMock.mockResolvedValue({ status: "unavailable" });
    await renderPage();

    expect(screen.getByText("Kohtaamisia ei löytynyt.")).toBeInTheDocument();
  });

  it("says so when the history could not be read", async () => {
    getHeadToHeadHistoryMock.mockResolvedValue({ status: "error" });
    await renderPage();

    expect(
      screen.getByText("Kohtaamisten lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
  });
});

describe("HeadToHeadPage on football-data", () => {
  const ENGLAND = 10;
  const WALES = 11;

  function fdMeeting(over: Partial<FootballDataMatchRow> & { providerMatchId: number }) {
    return {
      id: over.providerMatchId,
      competitionCode: "EC",
      seasonId: 2024,
      kickoffAt: new Date("2024-06-25T19:00:00Z"),
      matchday: 3,
      status: "FINISHED",
      stage: "GROUP_STAGE",
      groupName: "GROUP_C",
      homeTeamProviderId: ENGLAND,
      homeTeamName: "England",
      awayTeamProviderId: WALES,
      awayTeamName: "Wales",
      homeGoals: 2,
      awayGoals: 0,
      updatedAt: new Date("2024-06-26T00:00:00Z"),
      ...over,
    } as FootballDataMatchRow;
  }

  const ROUTE_NT = {
    source: { kind: "football-data", region: "national-teams" },
    basePath: "/maajoukkueet",
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [fdMeeting({ providerMatchId: 500 })],
    });
  });

  it("names the countries in Finnish, as the rest of the region does", async () => {
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    render(
      await HeadToHeadPage({
        ...ROUTE_NT,
        params: Promise.resolve({ a: String(ENGLAND), b: String(WALES) }),
      })
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Kohtaamiset: Englanti – Wales"
    );
  });

  it("labels each row by the competition its code names", async () => {
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    render(
      await HeadToHeadPage({
        ...ROUTE_NT,
        params: Promise.resolve({ a: String(ENGLAND), b: String(WALES) }),
      })
    );

    expect(screen.getByRole("columnheader", { name: "Kilpailu" })).toBeInTheDocument();
    expect(screen.getByText("EM-kisat")).toBeInTheDocument();
  });

  it("is not found when the pair has never met, on this source too", async () => {
    // The football-data half has its own early return, and a pairing with no
    // meetings is a hand-typed URL whichever table it would have read.
    getHeadToHeadHistoryMock.mockResolvedValue({ status: "ok", matches: [] });
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    render(
      await HeadToHeadPage({
        ...ROUTE_NT,
        params: Promise.resolve({ a: String(ENGLAND), b: String(WALES) }),
      })
    );

    expect(screen.getByText("Kohtaamisia ei löytynyt.")).toBeInTheDocument();
  });

  it("keeps the provider's own names outside the national-team region", async () => {
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    render(
      await HeadToHeadPage({
        source: { kind: "football-data", region: "foreign" },
        basePath: "/ulkomaat",
        params: Promise.resolve({ a: String(ENGLAND), b: String(WALES) }),
      })
    );

    // `/ulkomaat` is club football: a club's name is not a country to localise.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Kohtaamiset: England – Wales"
    );
  });
});

describe("headToHeadMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("titles the tab with both teams", async () => {
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [meeting({ providerMatchId: 1 })],
    });
    const { headToHeadMetadata } = await import("@/components/head-to-head-page");

    expect(
      await headToHeadMetadata({ ...ROUTE, params: Promise.resolve({ a: "1", b: "2" }) })
    ).toEqual({ title: "Kohtaamiset: HJK – KuPS" });
  });

  it("falls back to the bare heading when there is no pair to name", async () => {
    getHeadToHeadHistoryMock.mockResolvedValue({ status: "ok", matches: [] });
    const { headToHeadMetadata } = await import("@/components/head-to-head-page");

    expect(
      await headToHeadMetadata({ ...ROUTE, params: Promise.resolve({ a: "1", b: "2" }) })
    ).toEqual({ title: "Kohtaamiset" });
  });
});

describe("HeadToHeadPage on a national team's own matches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHeadToHeadHistoryMock.mockResolvedValue({
      status: "ok",
      matches: [
        meeting({
          providerMatchId: 900,
          competitionCode: "maajp2025",
          categoryId: "UNL",
          seasonId: 2025,
          groupName: "C-liiga lohko 1",
          homeTeamProviderId: 1,
          homeTeamName: "Suomi",
          awayTeamProviderId: 2,
          awayTeamName: "Greece",
        }),
      ],
    });
  });

  it("renders Finland's opponents in Finnish", async () => {
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    render(
      await HeadToHeadPage({
        source: { kind: "taso", bucket: "national" },
        basePath: "/maajoukkueet/huuhkajat",
        nationalTeam: MENS_TEAM,
        params: Promise.resolve({ a: "1", b: "2" }),
      })
    );

    /**
     * `maajp18`'s older categories name some opponents in English, and
     * `FINNISH_TASO_TEAM_NAMES` covers exactly those — `Greece` is one of its
     * nine entries. The rest of the region localises them, and a head-to-head
     * page cannot be the one place that does not.
     */
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Kohtaamiset: Suomi – Kreikka"
    );
  });

  it("falls back to the series name when TASO cannot name the competition", async () => {
    const { HeadToHeadPage } = await import("@/components/head-to-head-page");
    render(
      await HeadToHeadPage({
        source: { kind: "taso", bucket: "national" },
        basePath: "/maajoukkueet/huuhkajat",
        nationalTeam: MENS_TEAM,
        params: Promise.resolve({ a: "1", b: "2" }),
      })
    );

    // The category map is mocked to `null` here, which is the unreadable case.
    expect(screen.getByText("C-liiga lohko 1")).toBeInTheDocument();
  });
});
