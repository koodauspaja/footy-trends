import { expect, test } from "@playwright/test";
import { HEALTH_PROVIDERS_HEADER, HEALTH_PROVIDERS_TOKEN } from "@/lib/platform/health-providers";

/**
 * The suite's server gets an answer to the health check's TASO request: signed against TASO, where
 * this is the one spec failing on a refusal; with the stand-in, only answered. One test in either
 * mode, so the freshness check sees the file covered.
 *
 * decisions/681-taso-request-signing.md
 * decisions/685-the-taso-spec-in-both-modes.md
 * decisions/814-health-providers-token.md
 */

test.describe("TASO", () => {
  test("answers the suite's server, or its stand-in does", async ({ request }) => {
    const response = await request.get("/api/health?providers=1", {
      headers: { [HEALTH_PROVIDERS_HEADER]: process.env[HEALTH_PROVIDERS_TOKEN] ?? "" },
    });

    expect(response.ok()).toBe(true);
    expect((await response.json()).checks.taso).toBe("ok");
  });
});
