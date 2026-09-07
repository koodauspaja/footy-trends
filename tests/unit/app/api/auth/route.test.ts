import { describe, expect, it, vi } from "vitest";

/**
 * The better-auth route handler. Mocked down to its wiring, because the module
 * under test is wiring: what matters is that better-auth's handler is the one
 * exported, and that the route can never be cached.
 *
 * Without this file the route has no test at all — which vitest reports as 100%
 * (it only measures files a test imports) while Sonar correctly reports 0%.
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

describe("auth route handler", () => {
  it("serves better-auth's own handler", async () => {
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
