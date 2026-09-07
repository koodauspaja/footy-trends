import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The settings route itself. Without this file it has no test, which vitest
 * scores as 100% — it only measures files a test imports — while Sonar
 * correctly reports 0%.
 */
const { getSession, listSessions, currentPreferencesRow, logger, state } = vi.hoisted(() => {
  const state = {
    signedIn: true,
    listThrows: false,
    sessionThrows: false,
    row: null as unknown,
  };
  return {
    state,
    getSession: vi.fn(async () => {
      if (state.sessionThrows) throw new Error("database down");
      return state.signedIn
        ? { user: { id: "user-1", name: "Matti" }, session: { token: "current-token" } }
        : null;
    }),
    listSessions: vi.fn(async () => {
      if (state.listThrows) throw new Error("boom");
      return [
        {
          id: "s1",
          token: "current-token",
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
          updatedAt: new Date().toISOString(),
        },
        // `user_agent` is nullable: behind some proxies the header never
        // arrives, and the row still has to render as something recognisable.
        {
          id: "s2",
          token: "other-token",
          userAgent: null,
          updatedAt: new Date().toISOString(),
        },
      ];
    }),
    currentPreferencesRow: vi.fn(async () => state.row),
    logger: { error: vi.fn() },
  };
});

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession, listSessions } } }));
vi.mock("@/lib/settings-actions", () => ({
  currentPreferencesRow,
  saveSettings: vi.fn(),
  signOutOtherDevices: vi.fn(),
  deleteAccount: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ refetch: vi.fn() }),
  signIn: { social: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/asetukset",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/lib/logger", () => ({ logger }));

async function renderPage() {
  const { default: Settings } = await import("@/app/settings/page");
  render(await Settings());
}

beforeEach(() => {
  vi.clearAllMocks();
  state.signedIn = true;
  state.listThrows = false;
  state.sessionThrows = false;
  state.row = null;
  // `clearAllMocks` clears calls but not implementations, so a
  // `mockResolvedValue` in one test would otherwise leak into the next.
  currentPreferencesRow.mockImplementation(async () => state.row);
});

describe("the settings route", () => {
  it("is never prerendered, because everything on it is per-reader", async () => {
    const route = await import("@/app/settings/page");

    expect(route.dynamic).toBe("force-dynamic");
  });

  it("asks a signed-out reader to sign in, rather than redirecting", async () => {
    state.signedIn = false;

    await renderPage();

    expect(screen.getByText("Kirjaudu sisään nähdäksesi asetuksesi.")).toBeInTheDocument();
    expect(screen.queryByText("Aloitusnäkymä")).not.toBeInTheDocument();
  });

  it("renders the three sections for a signed-in reader", async () => {
    await renderPage();

    expect(screen.getByText("Aloitusnäkymä")).toBeInTheDocument();
    expect(screen.getByText("Kirjautuneet laitteet")).toBeInTheDocument();
    expect(screen.getByText("Tilin poistaminen")).toBeInTheDocument();
  });

  it("describes the current device without an IP address", async () => {
    await renderPage();

    expect(screen.getByText("Chrome · macOS")).toBeInTheDocument();
    expect(screen.getByText("Tämä laite")).toBeInTheDocument();
    // A session with no user agent still gets a row, not a blank one.
    expect(screen.getByText("Tuntematon selain")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kirjaa ulos muut laitteet" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  });

  it("shows stored preferences as the selected values", async () => {
    state.row = {
      defaultRegion: "kotimaa",
      defaultCompetitionDomestic: "M1L",
      defaultCompetitionForeign: null,
      defaultCompetitionNational: null,
    };

    await renderPage();

    expect(screen.getByLabelText("Mistä sovellus aloittaa")).toHaveValue("kotimaa");
    expect(screen.getByLabelText("Kotimaan oletussarja")).toHaveValue("M1L");
  });

  it("does not turn a failed session lookup into an error page", async () => {
    // Nor into "sign in to see your settings": a failure is not proof the
    // reader is signed out, and they may well be signed in.
    state.sessionThrows = true;

    await renderPage();

    expect(
      screen.getByText("Asetusten lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Kirjaudu sisään nähdäksesi asetuksesi.")).not.toBeInTheDocument();
    expect(logger.error).toHaveBeenCalled();
  });

  it("withholds the form when preferences cannot be read", async () => {
    // Rendering defaults would show settings apparently reset, and a save
    // would overwrite the real ones.
    currentPreferencesRow.mockResolvedValue("error");

    await renderPage();

    expect(
      screen.getByText("Asetusten lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Aloitusnäkymä")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tallenna" })).not.toBeInTheDocument();
  });

  it("still renders the editable preferences when the device list fails", async () => {
    // A failing session list must not take the whole page with it.
    state.listThrows = true;

    await renderPage();

    expect(screen.getByText("Aloitusnäkymä")).toBeInTheDocument();
    // Unknown, not "only this device".
    expect(screen.getByText("Laitelistaa ei voitu ladata.")).toBeInTheDocument();
    expect(
      screen.queryByText("Olet kirjautunut sisään vain tällä laitteella.")
    ).not.toBeInTheDocument();
    expect(logger.error).toHaveBeenCalled();
  });
});
