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
 * What this *can* prove is the thing that matters to a stranger: the route
 * answers 404 rather than 403, so it does not confirm that an admin area
 * exists.
 */
test.describe("the admin area", () => {
  test("answers 404 to a signed-out visitor, rather than 403 or a redirect", async ({ page }) => {
    const response = await page.goto("/yllapito");

    expect(response?.status()).toBe(404);
    // Not a redirect to sign-in either: that would answer "there is something
    // here worth signing in for", which is the same disclosure as a 403.
    expect(new URL(page.url()).pathname).toBe("/yllapito");
  });

  test("does not offer the link to a signed-out visitor", async ({ page }) => {
    // The home page renders the header for everyone; a signed-out visitor sees
    // the sign-in control and no account menu at all.
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Ylläpito" })).toHaveCount(0);
  });
});
