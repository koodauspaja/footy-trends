import { expect, test } from "@playwright/test";

/**
 * The suite's server gets an answer to the signed TASO request the health check
 * makes: from TASO, where every other spec would pass on stored rows if it refused,
 * or from the stand-in, which answers it too. One test in either mode, so the
 * freshness check sees the file covered.
 *
 * decisions/681-taso-request-signing.md
 * decisions/685-the-taso-spec-in-both-modes.md
 */

test.describe("TASO", () => {
  test("answers the suite's server, or its stand-in does", async ({ request }) => {
    const response = await request.get("/api/health?providers=1");

    expect(response.ok()).toBe(true);
    expect((await response.json()).checks.taso).toBe("ok");
  });
});
