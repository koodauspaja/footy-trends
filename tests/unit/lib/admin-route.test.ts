import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { ADMIN_PATHS, looksMissing, NOWHERE } from "@/lib/admin-route";
import { config, proxy } from "@/proxy";

/**
 * The early-404 decision, from specs/028-admin-tools-and-roles.md.
 *
 * It exists because Next commits a 200 status before `notFound()` can be caught
 * whenever the response streams, so a signed-out stranger could tell
 * `/yllapito` from a missing URL by status alone. It is **not** an
 * authorisation, and the tests are written so that reading them cannot leave
 * anyone thinking it is.
 */
describe("looksMissing", () => {
  it.each([...ADMIN_PATHS])("answers as missing for %s without a session cookie", (path) => {
    expect(looksMissing(path, false)).toBe(true);
  });

  it.each([...ADMIN_PATHS])("lets %s through when a session cookie is present", (path) => {
    // Through to the page, which refuses properly via `requireAdmin()`. A
    // forged cookie buys only the 200 that every signed-in reader already gets.
    expect(looksMissing(path, true)).toBe(false);
  });

  it.each([
    ["the home page", "/"],
    ["a page that exists", "/suosikit"],
    ["a path merely starting the same way", "/yllapito-jotain"],
    ["a child path", "/yllapito/kayttajat"],
    ["the empty path", ""],
  ])("leaves %s alone", (_case, path) => {
    expect(looksMissing(path, false)).toBe(false);
  });

  it("matches the whole path, not a prefix", () => {
    // The mutation this guards is `pathname.startsWith(p)`, which would answer
    // 404 for every URL under `/admin…` — including routes that do not exist
    // yet and would then be invisible to whoever added them.
    expect(looksMissing("/adminx", false)).toBe(false);
  });
});

describe("the proxy's matcher", () => {
  it("covers exactly the paths the decision knows about", () => {
    // Next parses `matcher` at build time and refuses anything it cannot read
    // statically, so the literals there cannot be `...ADMIN_PATHS`. This is the
    // assertion that stops the duplicate drifting — adding a path in one place
    // and not the other fails here rather than in production.
    expect(config.matcher).toEqual([...ADMIN_PATHS]);
  });
});

describe("NOWHERE", () => {
  it("is not a route, and is not shaped like one anybody would add", () => {
    // If it ever became a real route the rewrite would serve it instead of a
    // 404 — silently, and only for signed-out visitors to the admin area.
    expect(NOWHERE.startsWith("/_")).toBe(true);
  });
});

describe("the proxy itself", () => {
  const request = (path: string, cookie?: string) =>
    new NextRequest(`https://example.fi${path}`, {
      headers: cookie === undefined ? {} : { cookie },
    });

  it("rewrites a signed-out visit to a path that does not exist", async () => {
    const response = proxy(request("/yllapito"));

    // A rewrite, so Next produces the same 404 it gives any missing URL —
    // measured byte-identical on a production build. A hand-built 404 would
    // have an empty body, which is itself a signal.
    expect(response.headers.get("x-middleware-rewrite")).toContain(NOWHERE);
  });

  it("lets a request carrying a session cookie through to the page", () => {
    const response = proxy(request("/yllapito", "better-auth.session_token=abc.def"));

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("leaves paths outside the admin area alone", () => {
    const response = proxy(request("/suosikit"));

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
});

describe("when the session cookie cannot be parsed", () => {
  it("refuses rather than throwing a 500", async () => {
    // The header is attacker-controlled. An uncaught throw here would answer
    // 500 for `/yllapito` — broken, and a louder signal than the 200 this file
    // exists to remove. Refusing is the same direction `requireAdmin()` fails
    // in.
    vi.resetModules();
    vi.doMock("better-auth/cookies", () => ({
      getSessionCookie: () => {
        throw new Error("malformed cookie");
      },
    }));
    const { proxy: guarded } = await import("@/proxy");

    const response = guarded(new NextRequest("https://example.fi/yllapito"));

    expect(response.headers.get("x-middleware-rewrite")).toContain("/_not-a-route");
    vi.doUnmock("better-auth/cookies");
  });
});
