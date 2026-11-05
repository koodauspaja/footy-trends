import { beforeEach, describe, expect, it, vi } from "vitest";
import { warmModules } from "../../support/warm-module";

/**
 * Saving one's own nickname: the rules applied on the server, each refusal and
 * its log line, and nothing stored without a session.
 *
 * decisions/077-nickname.md
 */

const { currentUserId, saveNickname, revalidatePath, logger } = vi.hoisted(() => ({
  currentUserId: vi.fn(),
  saveNickname: vi.fn(),
  revalidatePath: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/current-user", () => ({ currentUserId }));
vi.mock("@/lib/nickname-store", () => ({ saveNickname }));
vi.mock("@/lib/logger", () => ({ logger }));

const { saveNicknameAction } = await import("@/lib/nickname-actions");

beforeEach(() => {
  vi.clearAllMocks();
  currentUserId.mockResolvedValue("user-1");
  saveNickname.mockResolvedValue("set");
});

warmModules(() => import("@/lib/nickname-actions"));

describe("saveNicknameAction", () => {
  it("stores the normalised nickname and its key", async () => {
    expect(await saveNicknameAction("  Kalle   Kukko ")).toEqual({
      ok: true,
      nickname: "Kalle Kukko",
    });
    expect(saveNickname).toHaveBeenCalledWith("user-1", {
      nickname: "Kalle Kukko",
      key: "kalle kukko",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/asetukset");
  });

  it.each(["set", "changed", "removed"] as const)(
    "logs the outcome %s with the user id and never the nickname",
    async (outcome) => {
      saveNickname.mockResolvedValue(outcome);
      await saveNicknameAction("Kalle");

      expect(logger.info).toHaveBeenCalledWith({ userId: "user-1", outcome }, "Nickname saved");
      expect(JSON.stringify(logger.info.mock.calls)).not.toContain("Kalle");
    }
  );

  it("removes the nickname for an empty field", async () => {
    saveNickname.mockResolvedValue("removed");

    expect(await saveNicknameAction("   ")).toEqual({ ok: true, nickname: null });
    expect(saveNickname).toHaveBeenCalledWith("user-1", null);
  });

  it.each([
    ["length", "ab"],
    ["characters", "Kalle!"],
    ["word-list", "Iso Paska"],
  ] as const)("refuses %s before storing anything", async (reason, raw) => {
    expect(await saveNicknameAction(raw)).toEqual({ ok: false, reason });
    expect(saveNickname).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith({ userId: "user-1", reason }, "Nickname refused");
  });

  it("refuses a nickname another user has", async () => {
    saveNickname.mockResolvedValue("taken");

    expect(await saveNicknameAction("Kalle")).toEqual({ ok: false, reason: "taken" });
    expect(logger.info).toHaveBeenCalledWith(
      { userId: "user-1", reason: "taken" },
      "Nickname refused"
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("stores nothing for a signed-out caller", async () => {
    currentUserId.mockResolvedValue(null);

    expect(await saveNicknameAction("Kalle")).toEqual({ ok: false, reason: "failed" });
    expect(saveNickname).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("Saving a nickname without a session");
  });

  it("refuses anything that is not text", async () => {
    expect(await saveNicknameAction({ nickname: "Kalle" })).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(saveNickname).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { userId: "user-1" },
      "Saving a nickname that is not text"
    );
  });

  it("reports a failed write as failed, and logs it with the user", async () => {
    const error = new Error("connection lost");
    saveNickname.mockRejectedValue(error);

    expect(await saveNicknameAction("Kalle")).toEqual({ ok: false, reason: "failed" });
    expect(logger.error).toHaveBeenCalledWith(
      { err: error, userId: "user-1" },
      "Saving a nickname failed"
    );
  });

  it("reports a failed session read as failed, with no user to name", async () => {
    const error = new Error("session store down");
    currentUserId.mockRejectedValue(error);

    expect(await saveNicknameAction("Kalle")).toEqual({ ok: false, reason: "failed" });
    expect(logger.error).toHaveBeenCalledWith(
      { err: error, userId: null },
      "Saving a nickname failed"
    );
  });
});
