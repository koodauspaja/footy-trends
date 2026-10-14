import { describe, expect, it, vi } from "vitest";
import { warmModules } from "../../../../support/warm-module";

/**
 * The better-auth route handler, mocked down to its wiring, because the module is wiring:
 * better-auth's handler is the one exported, and the route can never be cached. A route
 * file nothing imports is absent from the coverage report, so it has a test of its own.
 *
 * decisions/023-google-oauth-login.md
 */

const { toNextJsHandler, auth } = vi.hoisted(() => ({
  toNextJsHandler: vi.fn(() => ({
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  })),
  auth: { handler: vi.fn() },
}));

vi.mock("better-auth/next-js", () => ({ toNextJsHandler }));
vi.mock("@/lib/auth", () => ({ auth }));

warmModules(() => import("@/app/api/auth/[...all]/route"));

describe("auth route handler", () => {
  it("serves better-auth's own handler", async () => {
    // See `auth-client.test.ts`: vitest 5 clears mock calls before each test, so
    // the wiring call has to happen inside the test that asserts it.
    vi.resetModules();
    const route = await import("@/app/api/auth/[...all]/route");

    expect(toNextJsHandler).toHaveBeenCalledWith(auth);
    expect(route.GET).toBeTypeOf("function");
    expect(route.POST).toBeTypeOf("function");
  });

  it("is never cached, because every response is per-session", async () => {
    // A cached response here would serve one reader's session to another.
    const route = await import("@/app/api/auth/[...all]/route");

    expect(route.dynamic).toBe("force-dynamic");
  });
});
