import { beforeEach, describe, expect, it, vi } from "vitest";
import { warmModules } from "../../support/warm-module";

/**
 * The server action behind a fold, at its boundary: its arguments arrive from a
 * client that may send anything, and the user id comes from the session alone.
 *
 * decisions/071-section-toggles.md
 */

const { currentUserId, writeSectionChoice, logger } = vi.hoisted(() => ({
  currentUserId: vi.fn(async (): Promise<string | null> => "user-1"),
  writeSectionChoice: vi.fn(async () => undefined),
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/current-user", () => ({ currentUserId }));
vi.mock("@/lib/section-choices", () => ({ writeSectionChoice }));
vi.mock("@/lib/logger", () => ({ logger }));

const { saveSectionChoiceAction } = await import("@/lib/section-choice-actions");

warmModules(() => import("@/lib/section-choice-actions"));

beforeEach(() => {
  vi.clearAllMocks();
  currentUserId.mockResolvedValue("user-1");
  writeSectionChoice.mockResolvedValue(undefined);
});

describe("saveSectionChoiceAction", () => {
  it("stores the signed-in reader's choice under their own id", async () => {
    expect(await saveSectionChoiceAction("team", "analytics-other-seasons", false)).toEqual({
      ok: true,
    });
    expect(writeSectionChoice).toHaveBeenCalledWith(
      "user-1",
      "team",
      "analytics-other-seasons",
      false
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("refuses an unknown kind of page or section, stores nothing and logs only the keys", async () => {
    expect(await saveSectionChoiceAction("match", "analytics", true)).toEqual({ ok: false });
    expect(await saveSectionChoiceAction("team", "knockout", true)).toEqual({ ok: false });

    expect(writeSectionChoice).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenNthCalledWith(
      1,
      { pageKind: "match", section: "analytics" },
      "Section choice refused"
    );
    expect(logger.warn).toHaveBeenNthCalledWith(
      2,
      { pageKind: "team", section: "knockout" },
      "Section choice refused"
    );
  });

  it("refuses a state that is not open or closed", async () => {
    const open = "yes" as unknown as boolean;

    expect(await saveSectionChoiceAction("team", "matches", open)).toEqual({ ok: false });
    expect(writeSectionChoice).not.toHaveBeenCalled();
  });

  it("cuts a long key short in the log, since it came from the request", async () => {
    await saveSectionChoiceAction("x".repeat(500), "y".repeat(500), true);

    expect(logger.warn).toHaveBeenCalledWith(
      { pageKind: "x".repeat(40), section: "y".repeat(40) },
      "Section choice refused"
    );
  });

  it("refuses a request with no session, and reads no session for an unknown key", async () => {
    currentUserId.mockResolvedValue(null);

    expect(await saveSectionChoiceAction("standings", "analytics", true)).toEqual({ ok: false });
    expect(writeSectionChoice).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { pageKind: "standings", section: "analytics" },
      "Section choice refused"
    );

    currentUserId.mockClear();
    await saveSectionChoiceAction("team", "nope", true);
    expect(currentUserId).not.toHaveBeenCalled();
  });

  it("logs a failed write and answers not ok", async () => {
    writeSectionChoice.mockRejectedValue(new Error("database down"));

    expect(await saveSectionChoiceAction("team", "matches", false)).toEqual({ ok: false });
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Saving a section choice failed"
    );
  });
});
