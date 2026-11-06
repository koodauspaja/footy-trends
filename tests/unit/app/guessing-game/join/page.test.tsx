import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `/arvauspeli/liity/{token}` route: the invite in each state, a member
 * sent straight to the group, a token of the wrong shape answered as no group
 * without a read, and a failed read said.
 *
 * decisions/078-private-groups.md
 */

const { currentUserId, readInvite, logger, redirect } = vi.hoisted(() => ({
  currentUserId: vi.fn(async (): Promise<string | null> => "user-1"),
  readInvite: vi.fn(),
  logger: { error: vi.fn() },
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

vi.mock("@/lib/current-user", () => ({ currentUserId }));
vi.mock("@/lib/guessing-game-group-store", () => ({ readInvite }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/guessing-game-group-actions", () => ({ joinGroupAction: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ signIn: { social: vi.fn() } }));
vi.mock("next/navigation", () => ({
  redirect,
  usePathname: () => "/arvauspeli/liity/x",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

const TOKEN = "a".repeat(43);
const INVITE = { groupId: 5, name: "Kaverit", members: 2, member: false, player: true };

async function renderRoute(token: string) {
  const { default: InviteRoute } = await import("@/app/guessing-game/join/[token]/page");
  render(await InviteRoute({ params: Promise.resolve({ token }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUserId.mockResolvedValue("user-1");
  readInvite.mockResolvedValue(INVITE);
});

describe("/arvauspeli/liity/{token}", () => {
  it("offers a signed-in reader the group the link names", async () => {
    await renderRoute(TOKEN);
    expect(readInvite).toHaveBeenCalledWith("user-1", TOKEN);
    expect(screen.getByText("Sinut on kutsuttu ryhmään Kaverit (2 jäsentä).")).toBeInTheDocument();
  });

  it("names the group to a signed-out reader, with a way to sign in", async () => {
    currentUserId.mockResolvedValue(null);
    await renderRoute(TOKEN);
    expect(readInvite).toHaveBeenCalledWith(null, TOKEN);
    expect(screen.getByText("Kirjaudu sisään liittyäksesi ryhmään Kaverit.")).toBeInTheDocument();
  });

  it("sends a member straight to the group's page", async () => {
    readInvite.mockResolvedValue({ ...INVITE, member: true });
    await expect(renderRoute(TOKEN)).rejects.toThrow("NEXT_REDIRECT /arvauspeli/ryhmat/5");
  });

  it("says a link that names no group is not valid", async () => {
    readInvite.mockResolvedValue(null);
    await renderRoute(TOKEN);
    expect(screen.getByText(/Kutsulinkki ei ole voimassa/)).toBeInTheDocument();
  });

  it("answers a token of the wrong shape as no group, without reading anything", async () => {
    await renderRoute("short");
    expect(screen.getByText(/Kutsulinkki ei ole voimassa/)).toBeInTheDocument();
    expect(currentUserId).not.toHaveBeenCalled();
    expect(readInvite).not.toHaveBeenCalled();
  });

  it("says a failed read, and logs it without the token", async () => {
    readInvite.mockRejectedValue(new Error("database down"));
    await renderRoute(TOKEN);
    expect(
      screen.getByText("Kutsun lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Reading an Arvauspeli invite failed"
    );
  });
});
