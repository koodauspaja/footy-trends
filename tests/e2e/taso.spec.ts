import { expect, test } from "@playwright/test";

/**
 * TASO answering the suite's own server, through the signed request the health
 * check makes. Every other spec passes on stored rows when TASO refuses; this one
 * fails. Skipped with the stand-in, which refuses that request by design.
 *
 * decisions/681-taso-request-signing.md
 */

test.describe("TASO", () => {
  test.skip(process.env.E2E_TASO_STUB === "1", "the stand-in answers no live request");

  test("answers the suite's server, signed", async ({ request }) => {
    const response = await request.get("/api/health?providers=1");

    expect(response.ok()).toBe(true);
    expect((await response.json()).checks.taso).toBe("ok");
  });
});
