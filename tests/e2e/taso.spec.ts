import { expect, test } from "@playwright/test";

/**
 * TASO answering the suite's own server, through the signed request the health
 * check makes. Every other spec passes on stored rows when TASO refuses; this one
 * fails.
 *
 * decisions/681-taso-request-signing.md
 */

// Defined only without the stand-in, which refuses this request by design.
if (process.env.E2E_TASO_STUB !== "1") {
  test.describe("TASO", () => {
    test("answers the suite's server, signed", async ({ request }) => {
      const response = await request.get("/api/health?providers=1");

      expect(response.ok()).toBe(true);
      expect((await response.json()).checks.taso).toBe("ok");
    });
  });
}
