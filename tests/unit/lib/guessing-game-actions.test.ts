import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Arvauspeli's server actions: a request with no session, or with a match id or
 * guess that is not one, stores nothing; the store's refusals reach the browser
 * as the three a reader is told, and everything else as a failure to retry.
 *
 * decisions/072-match-guesses.md
 */

const { currentUserId, joinGame, placeGuess, logger } = vi.hoisted(() => ({
  currentUserId: vi.fn(async (): Promise<string | null> => "user-1"),
  joinGame: vi.fn(async () => undefined),
  placeGuess: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/current-user", () => ({ currentUserId }));
vi.mock("@/lib/guessing-game-store", () => ({ joinGame, placeGuess }));
vi.mock("@/lib/logger", () => ({ logger }));

const { joinGameAction, placeGuessAction } = await import("@/lib/guessing-game-actions");

const OUTCOME = { kind: "outcome", outcome: "X" };

beforeEach(() => {
  vi.clearAllMocks();
  currentUserId.mockResolvedValue("user-1");
  joinGame.mockResolvedValue(undefined);
});

describe("joinGameAction", () => {
  it("joins the signed-in reader", async () => {
    expect(await joinGameAction()).toEqual({ ok: true });
    expect(joinGame).toHaveBeenCalledWith("user-1", expect.any(Date));
  });

  it("refuses a request with no session, and logs it", async () => {
    currentUserId.mockResolvedValue(null);

    expect(await joinGameAction()).toEqual({ ok: false });
    expect(joinGame).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("Arvauspeli join refused: no session");
  });

  it("answers a failed write with ok false, and logs it", async () => {
    joinGame.mockRejectedValue(new Error("database down"));

    expect(await joinGameAction()).toEqual({ ok: false });
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Joining Arvauspeli failed"
    );
  });
});

describe("placeGuessAction", () => {
  it("places a parsed guess for the signed-in reader", async () => {
    placeGuess.mockResolvedValue({ ok: true, decision: { kind: "new", price: 10 } });

    expect(await placeGuessAction(42, OUTCOME)).toEqual({ ok: true });
    expect(placeGuess).toHaveBeenCalledWith(
      "user-1",
      42,
      { kind: "outcome", outcome: "X" },
      expect.any(Date)
    );
  });

  it("refuses a match id that is not a positive whole number, before reading anything", async () => {
    for (const id of [0, -1, 1.5, "42", Number.MAX_SAFE_INTEGER + 1, null]) {
      expect(await placeGuessAction(id, OUTCOME)).toEqual({ ok: false, reason: "failed" });
    }
    expect(currentUserId).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { providerMatchId: "42" },
      "Arvauspeli guess refused: not a guess"
    );
  });

  it("refuses a guess that is not one", async () => {
    expect(await placeGuessAction(42, { kind: "outcome", outcome: "3" })).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(placeGuess).not.toHaveBeenCalled();
  });

  it("refuses a request with no session", async () => {
    currentUserId.mockResolvedValue(null);

    expect(await placeGuessAction(42, OUTCOME)).toEqual({ ok: false, reason: "failed" });
    expect(placeGuess).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("Arvauspeli guess refused: no session");
  });

  it("passes the three refusals a reader is told", async () => {
    for (const reason of ["started", "insufficient", "free-fixed"]) {
      placeGuess.mockResolvedValueOnce({ ok: false, reason });
      expect(await placeGuessAction(42, OUTCOME)).toEqual({ ok: false, reason });
    }
  });

  it("answers any other refusal as a failure to retry", async () => {
    for (const reason of ["not-joined", "unknown-match"]) {
      placeGuess.mockResolvedValueOnce({ ok: false, reason });
      expect(await placeGuessAction(42, OUTCOME)).toEqual({ ok: false, reason: "failed" });
    }
  });

  it("answers a failed write as a failure, and logs it", async () => {
    placeGuess.mockRejectedValue(new Error("database down"));

    expect(await placeGuessAction(42, OUTCOME)).toEqual({ ok: false, reason: "failed" });
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Placing an Arvauspeli guess failed"
    );
  });
});
