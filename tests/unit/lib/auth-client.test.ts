import { describe, expect, it, vi } from "vitest";

/**
 * Every other test mocks `@/lib/auth-client`, so without this file the real
 * module is never imported: vitest reports 100% because it only measures files
 * a test touches, while Sonar reports 0% on a file nothing exercised.
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

describe("auth client", () => {
  it("takes its base URL from the origin it is served from", async () => {
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
