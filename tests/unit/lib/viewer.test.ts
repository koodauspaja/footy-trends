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
  it("returns nothing, and touches neither auth nor the database, with no cookie", async () => {
    // Signed-out readers are the overwhelming majority of traffic and must pay
    // nothing for a feature they cannot use.
    const { getViewerPreferences } = await import("@/lib/viewer");

    expect(await getViewerPreferences()).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
    expect(getPreferencesFor).not.toHaveBeenCalled();
  });

  it("ignores unrelated cookies", async () => {
    headerValue.cookie = "theme=dark; consent=1";
    const { getViewerPreferences } = await import("@/lib/viewer");

    expect(await getViewerPreferences()).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it.each([
    ["the plain cookie", "better-auth.session_token=abc"],
    // Production serves over HTTPS, where better-auth prefixes the name.
    ["the __Secure- prefixed cookie", "__Secure-better-auth.session_token=abc"],
  ])("reads preferences when %s is present", async (_case, cookie) => {
    headerValue.cookie = cookie;
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    getPreferencesFor.mockResolvedValue(PREFERENCES);
    const { getViewerPreferences } = await import("@/lib/viewer");

    expect(await getViewerPreferences()).toEqual(PREFERENCES);
    expect(getPreferencesFor).toHaveBeenCalledWith("user-1");
  });

  it("ignores an unrelated cookie whose value merely contains the name", async () => {
    // A substring match on the whole header would read this as authenticated
    // and construct better-auth for a signed-out reader.
    headerValue.cookie = "tracking=better-auth.session_token; theme=dark";
    const { getViewerPreferences } = await import("@/lib/viewer");

    expect(await getViewerPreferences()).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("finds the cookie among others, whatever the order", async () => {
    headerValue.cookie = "theme=dark; better-auth.session_token=abc; consent=1";
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    getPreferencesFor.mockResolvedValue(PREFERENCES);
    const { getViewerPreferences } = await import("@/lib/viewer");

    expect(await getViewerPreferences()).toEqual(PREFERENCES);
  });

  it("copes with a cookie fragment that carries no value", async () => {
    // Malformed or valueless fragments turn up in real cookie headers; they
    // must neither match nor throw.
    headerValue.cookie = "flag; better-auth.session_token=abc";
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    getPreferencesFor.mockResolvedValue(PREFERENCES);
    const { getViewerPreferences } = await import("@/lib/viewer");

    expect(await getViewerPreferences()).toEqual(PREFERENCES);
  });

  it("does not treat a bare valueless fragment as the session cookie", async () => {
    headerValue.cookie = "better-auth.session_token";
    const { getViewerPreferences } = await import("@/lib/viewer");

    // A name with no value is not a session; better-auth is never constructed.
    expect(await getViewerPreferences()).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
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
