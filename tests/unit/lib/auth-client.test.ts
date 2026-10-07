import { describe, expect, it, vi } from "vitest";
import { warmModules } from "../../support/warm-module";

/**
 * The real `@/lib/auth-client`, which every other test mocks. A file nothing
 * imports is absent from the coverage report, so it has a test of its own.
 *
 * decisions/023-google-oauth-login.md
 * decisions/288-vitest-5.md
 * decisions/384-a-dom-only-where-a-test-needs-one.md
 */

const { createAuthClient, client } = vi.hoisted(() => {
  const client = {
    signIn: { social: vi.fn() },
    signOut: vi.fn(),
    useSession: vi.fn(),
  };
  return { createAuthClient: vi.fn(() => client), client };
});

vi.mock("better-auth/react", () => ({ createAuthClient }));

warmModules(() => import("@/lib/auth-client"));

describe("auth client", () => {
  it("takes its base URL from the origin it is served from", async () => {
    // Instantiated here, not left to `warmModules`' import: vitest clears mock calls before
    // each test, so a call made in `beforeAll` is gone by now. `resetModules` drops module
    // instances, not Vite's transform cache, so the warm hook still pays that cost once.
    vi.resetModules();
    await import("@/lib/auth-client");

    // Passing a baseURL would mean a NEXT_PUBLIC_ variable inlined at build
    // time, which is wrong the moment the host differs from the build host.
    expect(createAuthClient).toHaveBeenCalledWith();
  });

  it("re-exports the three members the header uses", async () => {
    const module = await import("@/lib/auth-client");

    expect(module.signIn).toBe(client.signIn);
    expect(module.signOut).toBe(client.signOut);
    expect(module.useSession).toBe(client.useSession);
    expect(module.authClient).toBe(client);
  });
});
