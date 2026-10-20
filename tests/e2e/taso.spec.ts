import { type APIRequestContext, expect, test } from "@playwright/test";

/**
 * Where the suite's server sends TASO requests, through the signed request the
 * health check makes. Against TASO, every other spec passes on stored rows when it
 * refuses; this one fails. With the stand-in, it proves the request went there.
 *
 * decisions/681-taso-request-signing.md
 * decisions/685-the-taso-spec-in-both-modes.md
 */

async function tasoCheck(request: APIRequestContext): Promise<unknown> {
  const response = await request.get("/api/health?providers=1");
  expect(response.ok()).toBe(true);
  return (await response.json()).checks.taso;
}

// One test in either mode: a file with none is a spec the freshness check
// never sees covered.
test.describe("TASO", () => {
  if (process.env.E2E_TASO_STUB === "1") {
    test("is the stand-in, which refuses the health check's request", async ({ request }) => {
      expect(await tasoCheck(request)).toBe("error");
    });
  } else {
    test("answers the suite's server, signed", async ({ request }) => {
      expect(await tasoCheck(request)).toBe("ok");
    });
  }
});
