import { expect, test } from "@playwright/test";

/**
 * The suite's server gets an answer to the TASO request the health check makes.
 * Against TASO the request is signed, and this is the one spec that fails when TASO
 * refuses it. With the stand-in it checks only that the request is answered, not by
 * whom. One test in either mode, so the freshness check sees the file covered.
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
