import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, processAvatar, saveAvatar, deleteAvatar, revalidatePath, logger } = vi.hoisted(
  () => ({
    getSession: vi.fn(),
    processAvatar: vi.fn(),
    saveAvatar: vi.fn(),
    deleteAvatar: vi.fn(),
    revalidatePath: vi.fn(),
    logger: { error: vi.fn() },
  })
);

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/avatar", () => ({ saveAvatar, deleteAvatar }));
vi.mock("@/lib/avatar-image", () => ({ processAvatar }));
vi.mock("@/lib/logger", () => ({ logger }));

const { removeAvatarAction, saveAvatarAction } = await import("@/lib/avatar-actions");

const IMAGE = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
const BYTES = Buffer.from([9, 9, 9]);

function formWith(file: unknown): FormData {
  const form = new FormData();
  if (file instanceof File) form.set("avatar", file);
  return form;
}

function signedIn() {
  getSession.mockResolvedValue({ user: { id: "user-1" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  processAvatar.mockResolvedValue({ ok: true, bytes: BYTES, contentType: "image/webp" });
  saveAvatar.mockResolvedValue("avatar-token");
  deleteAvatar.mockResolvedValue(undefined);
});

describe("saveAvatarAction", () => {
  it("stores the processed bytes and returns the new version", async () => {
    signedIn();

    expect(await saveAvatarAction(formWith(IMAGE))).toEqual({ ok: true, version: "avatar-token" });
    expect(saveAvatar).toHaveBeenCalledWith("user-1", BYTES, "image/webp");
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("stores nothing for a signed-out caller", async () => {
    // The whole reason no action takes a user id from the client: with no
    // session there is nobody to store it for, and no id to guess.
    getSession.mockResolvedValue(null);

    expect(await saveAvatarAction(formWith(IMAGE))).toEqual({ ok: false, reason: "failed" });
    expect(processAvatar).not.toHaveBeenCalled();
    expect(saveAvatar).not.toHaveBeenCalled();
  });

  it("reports a missing file without reaching the encoder", async () => {
    signedIn();

    expect(await saveAvatarAction(new FormData())).toEqual({ ok: false, reason: "missing" });
    expect(processAvatar).not.toHaveBeenCalled();
  });

  it.each([["too-large"], ["unsupported"], ["unreadable"], ["missing"]] as const)(
    "passes the %s rejection through and stores nothing",
    async (reason) => {
      // Each maps to its own Finnish notice in the component, so a rejection
      // collapsed into a generic failure would tell the reader the wrong thing
      // to do next.
      signedIn();
      processAvatar.mockResolvedValue({ ok: false, reason });

      expect(await saveAvatarAction(formWith(IMAGE))).toEqual({ ok: false, reason });
      expect(saveAvatar).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    }
  );

  it("returns a result rather than rejecting when the session lookup throws", async () => {
    // The client awaits this with no rejection handler on the happy path, so a
    // throw here would leave the reader with a form that silently did nothing.
    getSession.mockRejectedValue(new Error("database down"));

    expect(await saveAvatarAction(formWith(IMAGE))).toEqual({ ok: false, reason: "failed" });
    expect(logger.error).toHaveBeenCalled();
  });

  it("returns a result rather than rejecting when storing throws", async () => {
    signedIn();
    saveAvatar.mockRejectedValue(new Error("write failed"));

    expect(await saveAvatarAction(formWith(IMAGE))).toEqual({ ok: false, reason: "failed" });
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("removeAvatarAction", () => {
  it("removes only the caller's own picture", async () => {
    signedIn();

    expect(await removeAvatarAction()).toEqual({ ok: true });
    expect(deleteAvatar).toHaveBeenCalledWith("user-1");
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
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
