import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `/arvauspeli` route itself: a signed-out reader is asked to sign in, a
 * failed read says so rather than looking signed out, and a player's view
 * reaches the page.
 *
 * decisions/072-match-guesses.md
 * decisions/077-nickname.md
 * decisions/073-leaderboard.md
 * decisions/075-season-guesses.md
 * decisions/078-private-groups.md
 */

const {
  currentUserId,
  openGame,
  getNickname,
  readOthers,
  readSeasonSectionOf,
  readGroupsOf,
  logger,
} = vi.hoisted(() => ({
  readOthers: vi.fn(),
  readGroupsOf: vi.fn(),
  readSeasonSectionOf: vi.fn(),
  currentUserId: vi.fn(async (): Promise<string | null> => "user-1"),
  openGame: vi.fn(),
  getNickname: vi.fn(async (): Promise<string | null> => null),
  logger: { error: vi.fn() },
}));

vi.mock("@/lib/current-user", () => ({ currentUserId }));
vi.mock("@/lib/guessing-game-store", () => ({ openGame }));
vi.mock("@/lib/nickname-store", () => ({ getNickname }));
vi.mock("@/lib/guessing-game-board", () => ({
  readOthers,
  boardSeason: (view: { seasonId?: number }) => view.seasonId ?? null,
}));
vi.mock("@/lib/guessing-game-group-store", () => ({ readGroupsOf }));
vi.mock("@/lib/guessing-game-group-actions", () => ({ createGroupAction: vi.fn() }));
vi.mock("@/lib/guessing-game-season-store", () => ({ readSeasonSectionOf }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/guessing-game-actions", () => ({
  joinGameAction: vi.fn(),
  placeGuessAction: vi.fn(),
  placeSeasonGuessAction: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({ signIn: { social: vi.fn() } }));
vi.mock("@/lib/section-choice-actions", () => ({ saveSectionChoiceAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/arvauspeli",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

async function renderPage() {
  const { default: GuessingGame } = await import("@/app/guessing-game/page");
  render(await GuessingGame());
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUserId.mockResolvedValue("user-1");
  getNickname.mockResolvedValue(null);
  readOthers.mockResolvedValue({ board: null, shares: new Map(), models: new Map() });
  readSeasonSectionOf.mockResolvedValue({ current: null, previous: null });
  readGroupsOf.mockResolvedValue([]);
});

describe("/arvauspeli", () => {
  it("asks a signed-out reader to sign in, and reads no game", async () => {
    currentUserId.mockResolvedValue(null);

    await renderPage();

    expect(screen.getByRole("heading", { name: "Arvauspeli" })).toBeInTheDocument();
    expect(screen.getByText("Kirjaudu sisään pelataksesi.")).toBeInTheDocument();
    expect(openGame).not.toHaveBeenCalled();
  });

  it("shows the signed-in reader's game", async () => {
    openGame.mockResolvedValue({ kind: "not-joined", seasonId: 2027, grant: 1000 });

    await renderPage();

    expect(openGame).toHaveBeenCalledWith("user-1", expect.any(Date));
    expect(screen.getByRole("button", { name: "Liity peliin" })).toBeInTheDocument();
  });

  it("says the game could not be read when the read or the session fails, and logs it", async () => {
    openGame.mockRejectedValueOnce(new Error("database down"));
    await renderPage();
    expect(
      screen.getByText("Arvauspelin lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();

    currentUserId.mockRejectedValueOnce(new Error("auth down"));
    await renderPage();
    expect(
      screen.getAllByText("Arvauspelin lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toHaveLength(2);
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it.each([
    [null, 1],
    ["Kalle", 0],
  ])(
    "reads the player's own nickname, %s, and tells one without where to choose it",
    async (nickname, lines) => {
      getNickname.mockResolvedValue(nickname);
      openGame.mockResolvedValue({
        kind: "playing",
        seasonId: 2027,
        balance: 1000,
        upcoming: [],
        awaiting: [],
        settled: [],
        groups: 1,
      });

      await renderPage();

      expect(getNickname).toHaveBeenCalledWith("user-1");
      expect(screen.queryAllByText(/jolla näyt tulostaulukossa/)).toHaveLength(lines);
    }
  );

  it("still shows the game when the nickname cannot be read, without the line", async () => {
    getNickname.mockRejectedValueOnce(new Error("database down"));
    openGame.mockResolvedValue({
      kind: "playing",
      seasonId: 2027,
      balance: 1000,
      upcoming: [],
      awaiting: [],
      settled: [],
      groups: 1,
    });

    await renderPage();

    expect(screen.getByText(/^Pelimerkit:/)).toBeInTheDocument();
    expect(screen.queryByText(/jolla näyt tulostaulukossa/)).not.toBeInTheDocument();
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), userId: "user-1" },
      "Reading the nickname on Arvauspeli failed"
    );
  });

  it("reads the other players beside the reader's view, at the same moment", async () => {
    const view = { kind: "not-joined", seasonId: 2027, grant: 1000 };
    openGame.mockResolvedValue(view);
    readOthers.mockResolvedValue({
      board: {
        rows: [{ nickname: "Aino", balance: 1040, settled: 3, rank: 1, place: 1, self: false }],
        own: null,
        players: 1,
      },
      shares: new Map(),
      models: new Map(),
    });

    await renderPage();

    expect(readOthers).toHaveBeenCalledWith(view, "user-1", openGame.mock.calls[0]?.[1]);
    expect(screen.getByRole("heading", { name: "Tulostaulukko" })).toBeInTheDocument();
    expect(screen.getByText("Aino")).toBeInTheDocument();
  });

  it("reads the player's season guesses for the view, at the same moment, and shows them", async () => {
    const view = {
      kind: "playing",
      seasonId: 2027,
      balance: 950,
      upcoming: [],
      awaiting: [],
      settled: [],
      groups: 1,
    };
    openGame.mockResolvedValue(view);
    const section = {
      seasonId: 2027,
      lockAt: new Date("2027-04-05T15:00:00Z"),
      locked: true,
      teams: [{ teamProviderId: 1, name: "HJK" }],
      guesses: { champion: { teams: [1], settled: null } },
      shares: { champion: null, last: null },
    };
    readSeasonSectionOf.mockResolvedValue({
      current: section,
      previous: {
        ...section,
        seasonId: 2026,
        teams: [{ teamProviderId: 2, name: "KuPS" }],
        guesses: { champion: { teams: [2], settled: null } },
      },
    });

    await renderPage();

    expect(readSeasonSectionOf).toHaveBeenCalledWith(view, "user-1", openGame.mock.calls[0]?.[1]);
    expect(screen.getByRole("heading", { name: "Kauden arvaukset" })).toBeInTheDocument();
    expect(screen.getByText("Arvauksesi: HJK")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kauden 2026 arvaukset" })).toBeInTheDocument();
    expect(screen.getByText("Arvauksesi: KuPS")).toBeInTheDocument();
  });

  it("reads no other players for a signed-out reader", async () => {
    currentUserId.mockResolvedValue(null);

    await renderPage();

    expect(readOthers).not.toHaveBeenCalled();
    expect(readSeasonSectionOf).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Tulostaulukko" })).not.toBeInTheDocument();
  });

  it("is never prerendered", async () => {
    const page = await import("@/app/guessing-game/page");

    expect(page.dynamic).toBe("force-dynamic");
    expect(page.metadata).toEqual({ title: "Arvauspeli" });
  });

  describe("Ryhmät", () => {
    const playing = {
      kind: "playing",
      seasonId: 2027,
      balance: 1000,
      upcoming: [],
      awaiting: [],
      settled: [],
      groups: 1,
    };

    it("reads a player's groups for the season the board shows, and lists them", async () => {
      openGame.mockResolvedValue(playing);
      readGroupsOf.mockResolvedValue([{ groupId: 4, name: "Kaverit", members: 2, rank: 1 }]);

      await renderPage();

      expect(readGroupsOf).toHaveBeenCalledWith("user-1", 2027);
      expect(screen.getByRole("link", { name: "Kaverit" })).toBeInTheDocument();
    });

    it.each([
      [{ kind: "between", nextSeasonId: 2028, joined: true, awaiting: [] }, 1],
      [{ kind: "no-season", joined: true }, 1],
      [{ kind: "no-season", joined: false }, 0],
      [{ kind: "not-joined", seasonId: 2027, grant: 1000 }, 0],
    ])("reads groups for a joined reader only: %o", async (view, reads) => {
      openGame.mockResolvedValue(view);
      await renderPage();
      expect(readGroupsOf).toHaveBeenCalledTimes(reads);
      expect(screen.queryAllByRole("heading", { name: "Ryhmät" })).toHaveLength(reads);
    });

    it("costs only the section when the groups cannot be read, and logs it", async () => {
      openGame.mockResolvedValue(playing);
      readGroupsOf.mockRejectedValue(new Error("database down"));

      await renderPage();

      expect(
        screen.getByText("Ryhmien lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
      ).toBeInTheDocument();
      expect(screen.getByText(/^Pelimerkit:/)).toBeInTheDocument();
      expect(logger.error).toHaveBeenCalledWith(
        { err: expect.any(Error), userId: "user-1" },
        "Reading Arvauspeli groups failed"
      );
    });
  });
});
