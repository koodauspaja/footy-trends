import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `/arvauspeli/ryhmat/{id}` route: a member sees the group, anyone else and
 * any id that names no group the same 404, a signed-out reader a way in, and a
 * failed read says so.
 *
 * decisions/078-private-groups.md
 */

const { currentUserId, openGame, readGroup, logger, notFound } = vi.hoisted(() => ({
  currentUserId: vi.fn(async (): Promise<string | null> => "user-1"),
  openGame: vi.fn(),
  readGroup: vi.fn(),
  logger: { error: vi.fn() },
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/current-user", () => ({ currentUserId }));
vi.mock("@/lib/guessing-game-store", () => ({ openGame }));
vi.mock("@/lib/guessing-game-group-store", () => ({ readGroup }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/guessing-game-group-actions", () => ({}));
vi.mock("@/lib/auth-client", () => ({ signIn: { social: vi.fn() } }));
vi.mock("next/navigation", () => ({
  notFound,
  usePathname: () => "/arvauspeli/ryhmat/5",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

async function renderRoute(id: string) {
  const { default: GroupRoute } = await import("@/app/guessing-game/groups/[id]/page");
  render(await GroupRoute({ params: Promise.resolve({ id }) }));
}

const GROUP = {
  groupId: 5,
  name: "Kaverit",
  inviteToken: "a".repeat(43),
  isOwner: false,
  members: [{ membershipId: 1, nickname: "Kalle", self: true, owner: true }],
  board: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  currentUserId.mockResolvedValue("user-1");
  openGame.mockResolvedValue({ kind: "playing", seasonId: 2027 });
  readGroup.mockResolvedValue(GROUP);
});

describe("/arvauspeli/ryhmat/{id}", () => {
  it("shows a member the group under its name, for the season the board shows", async () => {
    await renderRoute("5");
    expect(screen.getByRole("heading", { level: 1, name: "Kaverit" })).toBeInTheDocument();
    expect(readGroup).toHaveBeenCalledWith("user-1", 5, 2027);
  });

  it("answers a reader who is not a member with the 404", async () => {
    readGroup.mockResolvedValue(null);
    await expect(renderRoute("5")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("answers an id that cannot be a group's with the 404, reading nothing", async () => {
    await expect(renderRoute("abc")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(currentUserId).not.toHaveBeenCalled();
  });

  it("asks a signed-out reader to sign in, for any id alike", async () => {
    currentUserId.mockResolvedValue(null);
    await renderRoute("5");
    expect(screen.getByText("Kirjaudu sisään nähdäksesi ryhmän.")).toBeInTheDocument();
    expect(readGroup).not.toHaveBeenCalled();
  });

  it("says a failed read, and logs it with the group", async () => {
    readGroup.mockRejectedValue(new Error("database down"));
    await renderRoute("5");
    expect(
      screen.getByText("Ryhmän lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), userId: "user-1", groupId: 5 },
      "Reading an Arvauspeli group failed"
    );
  });
});
