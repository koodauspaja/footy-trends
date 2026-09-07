import { beforeEach, describe, expect, it, vi } from "vitest";

const { headerValue, getSession, getPreferencesFor, logger } = vi.hoisted(() => ({
  headerValue: { cookie: null as string | null, throws: false },
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
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/preferences", () => ({ getPreferencesFor }));
vi.mock("@/lib/logger", () => ({ logger }));

const PREFERENCES = {
  defaultRegion: "kotimaa",
  defaultCompetitionDomestic: "M1L",
  defaultCompetitionForeign: null,
  defaultCompetitionNational: null,
};

beforeEach(() => {
  vi.resetModules();
  headerValue.cookie = null;
  headerValue.throws = false;
  getSession.mockReset();
  getPreferencesFor.mockReset();
  logger.error.mockClear();
});

describe("getViewerPreferences", () => {
  /**
   * The cookie header decides whether a request is worth authenticating at all.
   * Both tables below assert the same two things, so they are tables rather
   * than a dozen near-identical tests: what the function returns, and — just as
   * important — whether better-auth was constructed at all.
   */
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
  });

  it("returns null when the cookie is stale and resolves to no session", async () => {
    headerValue.cookie = "better-auth.session_token=expired";
    getSession.mockResolvedValue(null);
    const { getViewerPreferences } = await import("@/lib/viewer");

    expect(await getViewerPreferences()).toBeNull();
    expect(getPreferencesFor).not.toHaveBeenCalled();
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
