import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `"use server"` boundary for the forced refresh, from
 * specs/029-forced-season-refresh.md.
 *
 * **A server action is a public network endpoint.** Neither the missing link
 * nor the page's not-found response keeps a caller out, so the only thing these
 * tests really have to establish is that `requireAdmin()` runs first in every
 * one of them — before the arguments are even looked at — and that a value the
 * browser sent is checked before it reaches the engine.
 */
const { requireAdmin, listSeasonsFor, previewRefresh, applyRefresh, state } = vi.hoisted(() => {
  const state = { adminId: "admin-1" as string | null };
  return {
    state,
    requireAdmin: vi.fn(async () => state.adminId),
    listSeasonsFor: vi.fn(async () => ({ ok: true, seasons: [{ seasonId: 2026, label: "2026" }] })),
    previewRefresh: vi.fn(async () => ({ ok: true, preview: { snapshotHash: "hash" } })),
    applyRefresh: vi.fn(async () => ({ ok: true, applied: { snapshotHash: "hash" } })),
  };
});

vi.mock("@/lib/admin-guard", () => ({ requireAdmin }));
vi.mock("@/lib/force-refresh", () => ({ listSeasonsFor, previewRefresh, applyRefresh }));

const VEIKKAUSLIIGA = "taso:VL";

beforeEach(() => {
  state.adminId = "admin-1";
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetModules();
});

describe("the gate", () => {
  it.each([
    ["seasonsForCompetitionAction", (m: never) => m],
    ["previewRefreshAction", (m: never) => m],
    ["applyRefreshAction", (m: never) => m],
  ])("%s refuses a caller who is not an admin, and calls no engine function", async (name) => {
    state.adminId = null;
    const actions = await import("@/lib/refresh-actions");
    const call = {
      seasonsForCompetitionAction: () => actions.seasonsForCompetitionAction(VEIKKAUSLIIGA),
      previewRefreshAction: () => actions.previewRefreshAction(VEIKKAUSLIIGA, 2026),
      applyRefreshAction: () => actions.applyRefreshAction(VEIKKAUSLIIGA, 2026, "hash"),
    }[name as "seasonsForCompetitionAction"];

    await expect(call()).resolves.toEqual({ ok: false, reason: "input" });
    expect(listSeasonsFor).not.toHaveBeenCalled();
    expect(previewRefresh).not.toHaveBeenCalled();
    expect(applyRefresh).not.toHaveBeenCalled();
  });

  it("refuses before the arguments are looked at", async () => {
    // The gate is checked first, so a refusal for a signed-out caller looks the
    // same whether or not their arguments were any good.
    state.adminId = null;
    const { previewRefreshAction } = await import("@/lib/refresh-actions");

    await expect(previewRefreshAction("nonsense", Number.NaN)).resolves.toEqual({
      ok: false,
      reason: "input",
    });
  });
});

describe("the competition a browser sent", () => {
  it.each([
    ["not one of ours", "taso:NOPE"],
    ["a source we do not have", "provider:VL"],
    ["no separator at all", "taso"],
    ["empty", ""],
  ])("is refused when it is %s", async (_case, value) => {
    const { previewRefreshAction } = await import("@/lib/refresh-actions");

    await expect(previewRefreshAction(value, 2026)).resolves.toEqual({
      ok: false,
      reason: "input",
    });
    expect(previewRefresh).not.toHaveBeenCalled();
  });

  it("is decoded into a source and a code before the engine sees it", async () => {
    const { previewRefreshAction } = await import("@/lib/refresh-actions");

    await previewRefreshAction("football-data:PL", 2025);

    expect(previewRefresh).toHaveBeenCalledWith({ source: "football-data", code: "PL" }, 2025);
  });
});

describe("the happy paths", () => {
  it("lists the seasons the engine offers", async () => {
    const { seasonsForCompetitionAction } = await import("@/lib/refresh-actions");

    await expect(seasonsForCompetitionAction(VEIKKAUSLIIGA)).resolves.toEqual({
      ok: true,
      seasons: [{ seasonId: 2026, label: "2026" }],
    });
    expect(listSeasonsFor).toHaveBeenCalledWith({ source: "taso", code: "VL" });
  });

  it("returns the preview unchanged", async () => {
    const { previewRefreshAction } = await import("@/lib/refresh-actions");

    await expect(previewRefreshAction(VEIKKAUSLIIGA, 2026)).resolves.toMatchObject({ ok: true });
  });

  it("takes the acting admin from the gate, never from the caller", async () => {
    const { applyRefreshAction } = await import("@/lib/refresh-actions");

    await applyRefreshAction(VEIKKAUSLIIGA, 2026, "hash-from-the-browser");

    expect(applyRefresh).toHaveBeenCalledWith(
      { source: "taso", code: "VL" },
      2026,
      "hash-from-the-browser",
      "admin-1"
    );
  });
});

describe("refusals from the engine", () => {
  it.each([["stale"], ["empty"], ["provider"], ["write"], ["cache"], ["read"]])(
    "passes a %s refusal through untouched",
    async (reason) => {
      applyRefresh.mockResolvedValueOnce({ ok: false, reason } as never);
      const { applyRefreshAction } = await import("@/lib/refresh-actions");

      await expect(applyRefreshAction(VEIKKAUSLIIGA, 2026, "hash")).resolves.toEqual({
        ok: false,
        reason,
      });
    }
  );

  it("passes the fresh diff back with a stale refusal", async () => {
    // Losing it here would leave the admin with a refusal and nothing to decide
    // on, which is the whole reason the engine returns one.
    applyRefresh.mockResolvedValueOnce({
      ok: false,
      reason: "stale",
      preview: { snapshotHash: "newer" },
    } as never);
    const { applyRefreshAction } = await import("@/lib/refresh-actions");

    const result = await applyRefreshAction(VEIKKAUSLIIGA, 2026, "hash");

    expect(result).toMatchObject({
      ok: false,
      reason: "stale",
      preview: { snapshotHash: "newer" },
    });
  });
});
