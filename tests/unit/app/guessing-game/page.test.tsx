import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `/arvauspeli` route itself: a signed-out reader is asked to sign in, a
 * failed read says so rather than looking signed out, and a player's view
 * reaches the page. A route file nothing imports is absent from the coverage
 * report, so it has a test of its own.
 *
 * decisions/072-match-guesses.md
 */

const { currentUserId, openGame, logger } = vi.hoisted(() => ({
  currentUserId: vi.fn(async (): Promise<string | null> => "user-1"),
  openGame: vi.fn(),
  logger: { error: vi.fn() },
}));

vi.mock("@/lib/current-user", () => ({ currentUserId }));
vi.mock("@/lib/guessing-game-store", () => ({ openGame }));
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

  it("is never prerendered", async () => {
    const page = await import("@/app/guessing-game/page");

    expect(page.dynamic).toBe("force-dynamic");
    expect(page.metadata).toEqual({ title: "Arvauspeli" });
  });
});
