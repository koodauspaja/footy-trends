import { beforeEach, describe, expect, it, vi } from "vitest";
import { warmModules } from "../../support/warm-module";

/**
 * The server action that removes a reader's own picture.
 *
 * decisions/025-custom-avatar.md
 */

const { getSession, deleteAvatar, revalidatePath, logger } = vi.hoisted(() => ({
  getSession: vi.fn(),
  deleteAvatar: vi.fn(),
  revalidatePath: vi.fn(),
  logger: { error: vi.fn() },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/avatar", () => ({ deleteAvatar }));
vi.mock("@/lib/logger", () => ({ logger }));

const { removeAvatarAction } = await import("@/lib/avatar-actions");

function signedIn() {
  getSession.mockResolvedValue({ user: { id: "user-1" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteAvatar.mockResolvedValue(undefined);
});

warmModules(() => import("@/lib/avatar-actions"));

describe("removeAvatarAction", () => {
  it("removes only the caller's own picture", async () => {
    signedIn();

    expect(await removeAvatarAction()).toEqual({ ok: true });
    expect(deleteAvatar).toHaveBeenCalledWith("user-1");
    // The reader's URL, not the App Router folder behind the rewrite — the same
    // path `settings-actions.ts` revalidates.
    expect(revalidatePath).toHaveBeenCalledWith("/asetukset");
  });

  it("removes nothing for a signed-out caller", async () => {
    getSession.mockResolvedValue(null);

    expect(await removeAvatarAction()).toEqual({ ok: false });
    expect(deleteAvatar).not.toHaveBeenCalled();
  });

  it("returns a result rather than rejecting when the delete throws", async () => {
    signedIn();
    deleteAvatar.mockRejectedValue(new Error("delete failed"));

    expect(await removeAvatarAction()).toEqual({ ok: false });
    expect(logger.error).toHaveBeenCalled();
  });
});
