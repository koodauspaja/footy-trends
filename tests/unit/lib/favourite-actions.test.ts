import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The four server actions behind the star, from specs/026-favourites.md.
 *
 * Nothing here may touch a real database or construct better-auth: the CI unit
 * job has no service containers and no environment at all, deliberately (#158).
 *
 * What these tests are actually about is the boundary. The arguments arrive
 * over the wire from a client that may send anything, and the user id never
 * does — it comes from the session, which is what makes "favourite something
 * for someone else" impossible rather than merely checked for.
 */
const {
  getSession,
  toggleFavouriteTeam,
  toggleFavouriteCompetition,
  removeFavouriteTeam,
  removeFavouriteCompetition,
  revalidatePath,
  logger,
  state,
} = vi.hoisted(() => {
  const state = {
    userId: "user-1" as string | null,
    write: { ok: true, favorite: true } as unknown,
    throws: false,
  };
  const writing = async () => {
    if (state.throws) throw new Error("database down");
    return state.write;
  };
  return {
    state,
    getSession: vi.fn(async () => (state.userId === null ? null : { user: { id: state.userId } })),
    toggleFavouriteTeam: vi.fn(writing),
    toggleFavouriteCompetition: vi.fn(writing),
    removeFavouriteTeam: vi.fn(async () => {
      if (state.throws) throw new Error("database down");
    }),
    removeFavouriteCompetition: vi.fn(async () => {
      if (state.throws) throw new Error("database down");
    }),
    revalidatePath: vi.fn(),
    logger: { error: vi.fn() },
  };
});

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/favourites", () => ({
  toggleFavouriteTeam,
  toggleFavouriteCompetition,
  removeFavouriteTeam,
  removeFavouriteCompetition,
}));

/**
 * Both spellings: the route is defined at `/favorites` and read at `/suosikit`,
 * and revalidating only one would leave a stale client-router entry under the
 * other.
 */
function expectRevalidated() {
  expect(revalidatePath.mock.calls.flat()).toEqual(["/suosikit", "/favorites"]);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.userId = "user-1";
  state.write = { ok: true, favorite: true };
  state.throws = false;
});

describe("toggleFavouriteTeamAction", () => {
  it("writes for the session's user, never for one the caller named", async () => {
    const { toggleFavouriteTeamAction } = await import("@/lib/favourite-actions");

    expect(await toggleFavouriteTeamAction("taso", 60731)).toEqual({ ok: true, favorite: true });
    expect(toggleFavouriteTeam).toHaveBeenCalledWith("user-1", "taso", 60731);
    expectRevalidated();
  });

  it("refuses a caller with no session", async () => {
    state.userId = null;
    const { toggleFavouriteTeamAction } = await import("@/lib/favourite-actions");

    expect(await toggleFavouriteTeamAction("taso", 60731)).toEqual({ ok: false, reason: "failed" });
    expect(toggleFavouriteTeam).not.toHaveBeenCalled();
  });

  it.each([
    ["a source the app does not have", "sportradar", 60731],
    ["an empty source", "", 60731],
    ["a fractional id", "taso", 2.5],
    ["a zero id", "taso", 0],
    ["a negative id", "taso", -1],
    ["an id past what the column can hold", "taso", 2_147_483_648],
    ["not a number at all", "taso", Number.NaN],
  ])("refuses %s without writing", async (_case, source, id) => {
    // A row with a source nothing matches could never be shown or removed
    // again: the reader would be stuck with an invisible favourite.
    const { toggleFavouriteTeamAction } = await import("@/lib/favourite-actions");

    expect(await toggleFavouriteTeamAction(source, id)).toEqual({ ok: false, reason: "failed" });
    expect(toggleFavouriteTeam).not.toHaveBeenCalled();
  });

  it("passes the cap refusal through, because the reader's next move differs", async () => {
    state.write = { ok: false, reason: "limit" };
    const { toggleFavouriteTeamAction } = await import("@/lib/favourite-actions");

    expect(await toggleFavouriteTeamAction("taso", 60731)).toEqual({ ok: false, reason: "limit" });
    // Nothing changed, so nothing to revalidate.
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a failure rather than throwing at the client", async () => {
    state.throws = true;
    const { toggleFavouriteTeamAction } = await import("@/lib/favourite-actions");

    expect(await toggleFavouriteTeamAction("taso", 60731)).toEqual({ ok: false, reason: "failed" });
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe("toggleFavouriteCompetitionAction", () => {
  it("writes for the session's user", async () => {
    const { toggleFavouriteCompetitionAction } = await import("@/lib/favourite-actions");

    expect(await toggleFavouriteCompetitionAction("kotimaa", "VL")).toEqual({
      ok: true,
      favorite: true,
    });
    expect(toggleFavouriteCompetition).toHaveBeenCalledWith("user-1", "kotimaa", "VL");
    expectRevalidated();
  });

  it("refuses a caller with no session", async () => {
    state.userId = null;
    const { toggleFavouriteCompetitionAction } = await import("@/lib/favourite-actions");

    expect(await toggleFavouriteCompetitionAction("kotimaa", "VL")).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(toggleFavouriteCompetition).not.toHaveBeenCalled();
  });

  it.each([
    ["a region the app does not have", "eurooppa", "LL"],
    ["an empty code", "kotimaa", ""],
    ["a code of only spaces", "kotimaa", "   "],
  ])("refuses %s without writing", async (_case, region, code) => {
    const { toggleFavouriteCompetitionAction } = await import("@/lib/favourite-actions");

    expect(await toggleFavouriteCompetitionAction(region, code)).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(toggleFavouriteCompetition).not.toHaveBeenCalled();
  });

  it("passes the cap refusal through, as the team action does", async () => {
    state.write = { ok: false, reason: "limit" };
    const { toggleFavouriteCompetitionAction } = await import("@/lib/favourite-actions");

    expect(await toggleFavouriteCompetitionAction("kotimaa", "VL")).toEqual({
      ok: false,
      reason: "limit",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a failure rather than throwing at the client", async () => {
    state.throws = true;
    const { toggleFavouriteCompetitionAction } = await import("@/lib/favourite-actions");

    expect(await toggleFavouriteCompetitionAction("kotimaa", "VL")).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe("removeFavouriteTeamAction", () => {
  it("removes for the session's user", async () => {
    const { removeFavouriteTeamAction } = await import("@/lib/favourite-actions");

    expect(await removeFavouriteTeamAction("taso", 60731)).toEqual({ ok: true });
    expect(removeFavouriteTeam).toHaveBeenCalledWith("user-1", "taso", 60731);
    expectRevalidated();
  });

  it("refuses a caller with no session", async () => {
    state.userId = null;
    const { removeFavouriteTeamAction } = await import("@/lib/favourite-actions");

    expect(await removeFavouriteTeamAction("taso", 60731)).toEqual({ ok: false });
    expect(removeFavouriteTeam).not.toHaveBeenCalled();
  });

  it.each([
    ["a source the app does not have", "sportradar", 60731],
    ["an id that is not one", "taso", 2.5],
  ])("refuses %s without deleting", async (_case, source, id) => {
    const { removeFavouriteTeamAction } = await import("@/lib/favourite-actions");

    expect(await removeFavouriteTeamAction(source, id)).toEqual({ ok: false });
    expect(removeFavouriteTeam).not.toHaveBeenCalled();
  });

  it("reports a failure rather than throwing at the client", async () => {
    state.throws = true;
    const { removeFavouriteTeamAction } = await import("@/lib/favourite-actions");

    expect(await removeFavouriteTeamAction("taso", 60731)).toEqual({ ok: false });
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe("removeFavouriteCompetitionAction", () => {
  it("removes for the session's user", async () => {
    const { removeFavouriteCompetitionAction } = await import("@/lib/favourite-actions");

    expect(await removeFavouriteCompetitionAction("kotimaa", "VL")).toEqual({ ok: true });
    expect(removeFavouriteCompetition).toHaveBeenCalledWith("user-1", "kotimaa", "VL");
  });

  it("refuses a caller with no session", async () => {
    state.userId = null;
    const { removeFavouriteCompetitionAction } = await import("@/lib/favourite-actions");

    expect(await removeFavouriteCompetitionAction("kotimaa", "VL")).toEqual({ ok: false });
    expect(removeFavouriteCompetition).not.toHaveBeenCalled();
  });

  it("refuses a region the app does not have", async () => {
    const { removeFavouriteCompetitionAction } = await import("@/lib/favourite-actions");

    expect(await removeFavouriteCompetitionAction("eurooppa", "LL")).toEqual({ ok: false });
    expect(removeFavouriteCompetition).not.toHaveBeenCalled();
  });

  it("reports a failure rather than throwing at the client", async () => {
    state.throws = true;
    const { removeFavouriteCompetitionAction } = await import("@/lib/favourite-actions");

    expect(await removeFavouriteCompetitionAction("kotimaa", "VL")).toEqual({ ok: false });
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
