import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `/arvauspeli` route itself: a signed-out reader is asked to sign in, a
 * failed read says so rather than looking signed out, and a player's view
 * reaches the page.
 *
 * decisions/072-match-guesses.md
 * decisions/077-nickname.md
 */

const { currentUserId, openGame, getNickname, logger } = vi.hoisted(() => ({
  currentUserId: vi.fn(async (): Promise<string | null> => "user-1"),
  openGame: vi.fn(),
  getNickname: vi.fn(async (): Promise<string | null> => null),
  logger: { error: vi.fn() },
}));

vi.mock("@/lib/current-user", () => ({ currentUserId }));
vi.mock("@/lib/guessing-game-store", () => ({ openGame }));
vi.mock("@/lib/nickname-store", () => ({ getNickname }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/guessing-game-actions", () => ({
  joinGameAction: vi.fn(),
  placeGuessAction: vi.fn(),
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

  it("is never prerendered", async () => {
    const page = await import("@/app/guessing-game/page");

    expect(page.dynamic).toBe("force-dynamic");
    expect(page.metadata).toEqual({ title: "Arvauspeli" });
  });
});
