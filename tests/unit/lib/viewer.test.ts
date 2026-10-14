import { beforeEach, describe, expect, it, vi } from "vitest";
import { warmModules } from "../../support/warm-module";

/**
 * The viewer: whether a request is worth authenticating, and the reader's
 * preferences.
 *
 * decisions/024-account-settings.md
 * decisions/536-database-url-required.md
 */

const { headerValue, loaded, getSession, getPreferencesFor, logger } = vi.hoisted(() => ({
  headerValue: { cookie: null as string | null, throws: false },
  /** How often each deferred module was loaded: its mock's factory runs on import. */
  loaded: { auth: 0, preferences: 0 },
  getSession: vi.fn(),
  getPreferencesFor: vi.fn(),
  logger: { error: vi.fn() },
}));

vi.mock("next/headers", () => ({
  headers: async () => {
    if (headerValue.throws) throw new Error("headers unavailable");
    return { get: (name: string) => (name === "cookie" ? headerValue.cookie : null) };
  },
}));
vi.mock("@/lib/logger", () => ({ logger }));

const PREFERENCES = {
  defaultRegion: "kotimaa",
  defaultCompetitionDomestic: "M1L",
  defaultCompetitionForeign: null,
  defaultCompetitionNational: null,
};

beforeEach(() => {
  vi.resetModules();
  // Registered per test, after the reset, so each factory runs again the next
  // time its module is imported: that run is the load being counted.
  vi.doMock("@/lib/auth", () => {
    loaded.auth += 1;
    return { auth: { api: { getSession } } };
  });
  vi.doMock("@/lib/preferences", () => {
    loaded.preferences += 1;
    return { getPreferencesFor };
  });
  headerValue.cookie = null;
  headerValue.throws = false;
  getSession.mockReset();
  getPreferencesFor.mockReset();
  logger.error.mockClear();
  loaded.auth = 0;
  loaded.preferences = 0;
});

warmModules(() => import("@/lib/viewer"));

describe("getViewerPreferences", () => {
  // The cookie header decides whether a request is worth authenticating at all.
  // Tables, not a dozen near-identical tests, as both assert the same two things:
  // what the function returns, and whether better-auth was constructed at all.
  it.each([
    ["no cookie header at all", null],
    ["only unrelated cookies", "theme=dark; consent=1"],
    // A substring match on the whole header would read this as authenticated.
    ["a cookie whose *value* contains the name", "tracking=better-auth.session_token; theme=dark"],
    // A name with no value carries no token.
    ["a bare valueless fragment", "better-auth.session_token"],
  ])("takes the signed-out path for %s", async (_case, cookie) => {
    // Signed-out readers are the overwhelming majority of traffic and must pay
    // nothing for a feature they cannot use — not even constructing better-auth.
    headerValue.cookie = cookie;
    const { getViewerPreferences } = await import("@/lib/viewer");

    expect(await getViewerPreferences()).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
    expect(getPreferencesFor).not.toHaveBeenCalled();
    // Not called is not enough: neither module may even be loaded, since
    // `auth` builds better-auth on import and `preferences` brings the database.
    expect(loaded).toEqual({ auth: 0, preferences: 0 });
  });

  it("loads nothing when the module itself is imported", async () => {
    await import("@/lib/viewer");

    expect(loaded).toEqual({ auth: 0, preferences: 0 });
  });

  it.each([
    ["the plain cookie", "better-auth.session_token=abc"],
    // Production serves over HTTPS, where better-auth prefixes the name.
    ["the __Secure- prefixed cookie", "__Secure-better-auth.session_token=abc"],
    ["the cookie among others", "theme=dark; better-auth.session_token=abc; consent=1"],
    // Malformed or valueless fragments turn up in real headers alongside good
    // ones; they must neither match nor throw.
    ["a valueless fragment beside it", "flag; better-auth.session_token=abc"],
  ])("reads preferences for %s", async (_case, cookie) => {
    headerValue.cookie = cookie;
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    getPreferencesFor.mockResolvedValue(PREFERENCES);
    const { getViewerPreferences } = await import("@/lib/viewer");

    expect(await getViewerPreferences()).toEqual(PREFERENCES);
    expect(getPreferencesFor).toHaveBeenCalledWith("user-1");
    // A signed-in reader is who both deferred modules are for.
    expect(loaded).toEqual({ auth: 1, preferences: 1 });
  });

  it("returns null when the cookie is stale and resolves to no session", async () => {
    headerValue.cookie = "better-auth.session_token=expired";
    getSession.mockResolvedValue(null);
    const { getViewerPreferences } = await import("@/lib/viewer");

    expect(await getViewerPreferences()).toBeNull();
    expect(getPreferencesFor).not.toHaveBeenCalled();
    // The session had to be asked for; the preferences never were.
    expect(loaded).toEqual({ auth: 1, preferences: 0 });
  });

  it("degrades to the hardcoded defaults when the lookup throws", async () => {
    // A database blip must cost the reader their preference, not the page.
    headerValue.cookie = "better-auth.session_token=abc";
    getSession.mockRejectedValue(new Error("database down"));
    const { getViewerPreferences } = await import("@/lib/viewer");

    expect(await getViewerPreferences()).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});
