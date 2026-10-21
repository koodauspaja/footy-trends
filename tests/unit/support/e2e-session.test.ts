import { serializeSignedCookie } from "better-call";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE, signedSessionCookie } from "../../support/e2e-session";

/**
 * The e2e session cookie, signed as better-auth's own library signs it, so a
 * change in that format fails here rather than as signed-out pages.
 *
 * decisions/695-ux-sweep.md
 */

describe("signedSessionCookie", () => {
  it("signs a session token exactly as better-call does", async () => {
    const serialized = await serializeSignedCookie(SESSION_COOKIE, "a-token", "a-secret");
    const value = serialized.split(";")[0]?.split("=").slice(1).join("=");

    expect(signedSessionCookie("a-token", "a-secret")).toBe(value);
  });
});
