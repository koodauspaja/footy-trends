import { makeSignature } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { signedSessionCookie } from "../../support/e2e-session";

/**
 * The e2e session cookie, signed as better-auth's own library signs it, so a
 * change in that format fails here rather than as signed-out pages.
 *
 * decisions/695-ux-sweep.md
 */

describe("signedSessionCookie", () => {
  it("signs a session token exactly as better-auth's makeSignature does", async () => {
    const signature = await makeSignature("a-token", "a-secret");

    expect(signedSessionCookie("a-token", "a-secret")).toBe(
      encodeURIComponent(`a-token.${signature}`)
    );
  });
});
