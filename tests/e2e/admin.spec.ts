import { expect, test } from "@playwright/test";

/**
 * `/yllapito` from the outside, from specs/028-admin-tools-and-roles.md.
 *
 * **One test, deliberately.** The suite cannot forge a session — the same
 * limitation `favourite-actions.ts` notes — so everything behind the gate is
 * covered by unit and integration tests instead. Asserting that a page a
 * signed-out visitor cannot reach does not contain some string would prove
 * nothing, which is the first defect class in `skills/self-review.md`.
 *
 * What this *can* prove is the thing that matters to a stranger: the body of
 * the refusal names nothing. It is not a 403 and it is not the admin page; it
 * is the same generic not-found page any missing URL renders.
 */
test.describe("the admin area", () => {
  test("gives a signed-out visitor the not-found page, naming nothing", async ({ page }) => {
    await page.goto("/yllapito");

    // The **body** is what has to give nothing away. The status is 200 rather
    // than 404 — Next commits it before `notFound()` is caught whenever the
    // response streams — so the route is identifiable as real, which the spec
    // accepts and explains rather than working around.
    const body = await page.content();
    expect(body).not.toContain("Ylläpito");
    expect(body).not.toContain("Käyttäjät");
    expect(body).not.toContain("Sähköposti");
    expect(new URL(page.url()).pathname).toBe("/yllapito");
  });

  test("does not offer the link to a signed-out visitor", async ({ page }) => {
    // The home page renders the header for everyone; a signed-out visitor sees
    // the sign-in control and no account menu at all.
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Ylläpito" })).toHaveCount(0);
  });
});
