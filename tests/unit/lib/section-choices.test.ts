import { beforeEach, describe, expect, it, vi } from "vitest";
import { warmModules } from "../../support/warm-module";

/**
 * Reading a page's sections for whoever is reading it: the defaults for a
 * signed-out reader or a failed read, the stored choices otherwise. The SQL runs
 * against a real database in `tests/integration/section-choices.test.ts`.
 *
 * decisions/071-section-toggles.md
 */

const { state, currentUserId, logger } = vi.hoisted(() => {
  const state = {
    rows: [] as Array<{ section: string; open: boolean }>,
    readFails: false,
  };
  return {
    state,
    currentUserId: vi.fn(async (): Promise<string | null> => "user-1"),
    logger: { error: vi.fn(), warn: vi.fn() },
  };
});

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => {
          if (state.readFails) throw new Error("database down");
          return state.rows;
        },
      }),
    }),
  },
}));
vi.mock("@/lib/current-user", () => ({ currentUserId }));
vi.mock("@/lib/logger", () => ({ logger }));

const { getPageSections } = await import("@/lib/section-choices");

warmModules(() => import("@/lib/section-choices"));

beforeEach(() => {
  vi.clearAllMocks();
  currentUserId.mockResolvedValue("user-1");
  state.rows = [];
  state.readFails = false;
});

describe("getPageSections", () => {
  it("gives a signed-out reader the defaults, with nothing to save", async () => {
    currentUserId.mockResolvedValue(null);

    expect(await getPageSections("team")).toEqual({ kind: "team", signedIn: false, choices: {} });
  });

  it("gives a signed-in reader their stored choices, by section", async () => {
    state.rows = [
      { section: "analytics", open: true },
      { section: "analytics-other-seasons", open: false },
    ];

    expect(await getPageSections("team")).toEqual({
      kind: "team",
      signedIn: true,
      choices: { analytics: true, "analytics-other-seasons": false },
    });
  });

  it("logs a failed read and gives the defaults, still saving the reader's toggles", async () => {
    state.readFails = true;

    expect(await getPageSections("standings")).toEqual({
      kind: "standings",
      signedIn: true,
      choices: {},
    });
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Reading section choices failed"
    );
  });

  it("logs a session that cannot be read and treats the reader as signed out", async () => {
    currentUserId.mockRejectedValue(new Error("auth down"));

    expect(await getPageSections("national-team")).toEqual({
      kind: "national-team",
      signedIn: false,
      choices: {},
    });
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Reading section choices failed"
    );
  });
});
