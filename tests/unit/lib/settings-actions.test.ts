import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The server actions behind the settings page. Nothing here may touch a real
 * database or construct better-auth: the CI unit job has no service containers
 * and no environment at all, deliberately (#158).
 *
 * Without this file the module has no test, which vitest scores as 100% — it
 * only measures files a test imports — while Sonar correctly reports 0%.
 */
const {
  getSession,
  revokeOtherSessions,
  deleteUser,
  insert,
  onConflictDoUpdate,
  limit,
  revalidatePath,
  logger,
  state,
} = vi.hoisted(() => {
  const state = { userId: "user-1" as string | null, insertThrows: false, rows: [] as unknown[] };
  const onConflictDoUpdate = vi.fn(async () => {
    if (state.insertThrows) throw new Error("database down");
  });
  return {
    state,
    getSession: vi.fn(async () => (state.userId === null ? null : { user: { id: state.userId } })),
    revokeOtherSessions: vi.fn(async () => ({})),
    deleteUser: vi.fn(async () => ({})),
    onConflictDoUpdate,
    insert: vi.fn(() => ({ values: () => ({ onConflictDoUpdate }) })),
    limit: vi.fn(async () => state.rows),
    revalidatePath: vi.fn(),
    logger: { error: vi.fn() },
  };
});

vi.mock("@/db", () => ({
  db: { insert, select: () => ({ from: () => ({ where: () => ({ limit }) }) }) },
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession, revokeOtherSessions, deleteUser } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/logger", () => ({ logger }));

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.userId = "user-1";
  state.insertThrows = false;
  state.rows = [];
});

describe("saveSettings", () => {
  it("stores what the reader chose", async () => {
    const { saveSettings } = await import("@/lib/settings-actions");

    expect(
      await saveSettings(form({ defaultRegion: "kotimaa", defaultCompetitionDomestic: "M1L" }))
    ).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("treats an empty selection as no preference, not an empty string", async () => {
    // The unset option is a real value; storing "" would be a third state
    // nothing knows how to read.
    const { saveSettings } = await import("@/lib/settings-actions");
    await saveSettings(form({ defaultRegion: "", defaultCompetitionDomestic: "  " }));

    const [[values]] = onConflictDoUpdate.mock.calls as unknown as [
      [{ set: Record<string, unknown> }],
    ];
    expect(values.set.defaultRegion).toBeNull();
    expect(values.set.defaultCompetitionDomestic).toBeNull();
  });

  it("refuses to store a region that is not one of the three", async () => {
    const { saveSettings } = await import("@/lib/settings-actions");
    await saveSettings(form({ defaultRegion: "eurooppa" }));

    const [[values]] = onConflictDoUpdate.mock.calls as unknown as [
      [{ set: Record<string, unknown> }],
    ];
    expect(values.set.defaultRegion).toBeNull();
  });

  it("does nothing for a reader who is not signed in", async () => {
    // No action takes a user id from the client, so an absent session is the
    // end of it.
    state.userId = null;
    const { saveSettings } = await import("@/lib/settings-actions");

    expect(await saveSettings(form({ defaultRegion: "kotimaa" }))).toEqual({ ok: false });
    expect(insert).not.toHaveBeenCalled();
  });

  it("reports a database failure instead of claiming a save", async () => {
    state.insertThrows = true;
    const { saveSettings } = await import("@/lib/settings-actions");

    expect(await saveSettings(form({ defaultRegion: "kotimaa" }))).toEqual({ ok: false });
    expect(logger.error).toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("signOutOtherDevices", () => {
  it("revokes the other sessions and refreshes the page", async () => {
    const { signOutOtherDevices } = await import("@/lib/settings-actions");

    expect(await signOutOtherDevices()).toEqual({ ok: true });
    expect(revokeOtherSessions).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/asetukset");
  });

  it("reports a failure rather than leaving the reader thinking devices were signed out", async () => {
    revokeOtherSessions.mockRejectedValueOnce(new Error("boom"));
    const { signOutOtherDevices } = await import("@/lib/settings-actions");

    expect(await signOutOtherDevices()).toEqual({ ok: false });
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("deleteAccount", () => {
  it("deletes when the confirmation is exact", async () => {
    const { deleteAccount } = await import("@/lib/settings-actions");

    expect(await deleteAccount("POISTA")).toEqual({ ok: true });
    expect(deleteUser).toHaveBeenCalledTimes(1);
  });

  it("accepts the word with surrounding whitespace", async () => {
    const { deleteAccount } = await import("@/lib/settings-actions");

    expect(await deleteAccount("  POISTA  ")).toEqual({ ok: true });
  });

  it.each([
    ["lowercase", "poista"],
    ["mixed case", "Poista"],
    ["another word", "DELETE"],
    ["nothing", ""],
  ])("refuses %s, even though the button is already disabled", async (_case, confirmation) => {
    // Belt and braces: a form can be submitted without its button, and this is
    // irreversible.
    const { deleteAccount } = await import("@/lib/settings-actions");

    expect(await deleteAccount(confirmation)).toEqual({ ok: false });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("reports a failure rather than sending the reader away as if it worked", async () => {
    deleteUser.mockRejectedValueOnce(new Error("boom"));
    const { deleteAccount } = await import("@/lib/settings-actions");

    expect(await deleteAccount("POISTA")).toEqual({ ok: false });
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("currentPreferencesRow", () => {
  it("returns the reader's row", async () => {
    state.rows = [{ id: "p1", userId: "user-1", defaultRegion: "kotimaa" }];
    const { currentPreferencesRow } = await import("@/lib/settings-actions");

    expect(await currentPreferencesRow()).toMatchObject({ defaultRegion: "kotimaa" });
  });

  it("returns null when there is no row yet", async () => {
    const { currentPreferencesRow } = await import("@/lib/settings-actions");

    expect(await currentPreferencesRow()).toBeNull();
  });

  it("returns null for a reader who is not signed in", async () => {
    state.userId = null;
    const { currentPreferencesRow } = await import("@/lib/settings-actions");

    expect(await currentPreferencesRow()).toBeNull();
  });
});
