import { expect, test } from "@playwright/test";

/**
 * Team search, from specs/027-team-search.md.
 *
 * **Signed out throughout, and that is the whole feature this suite can reach.**
 * The search is offered only to a signed-in reader, and the suite cannot forge
 * a session — the same limit `favourite-actions.ts` records. So what is checked
 * here is the half that matters for everyone else: the field is *absent*, not
 * merely disabled or refusing on submit, which is what #247 asks for.
 */
test.describe("Team search", () => {
  test("is not offered to a signed-out reader anywhere", async ({ page }) => {
    for (const path of ["/", "/kotimaa/sarjataulukko", "/ulkomaat/sarjataulukko"]) {
      await page.goto(path);

      await expect(page.getByRole("searchbox", { name: "Hae joukkuetta" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Hae", exact: true })).toHaveCount(0);
    }
  });

  test("leaves the header's own controls alone", async ({ page }) => {
    // The field renders nothing signed out, so the header a visitor sees is
    // exactly the one they saw before this feature existed.
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Kirjaudu sisään" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Murupolku" })).toBeVisible();
  });

  test("the front page still serves its content without JavaScript", async ({ browser }) => {
    /**
     * The previous version of this test asserted only that the served HTML did
     * **not** contain `Hae joukkuetta` — which `TeamSearch` guarantees by
     * returning null before hydration. It passed with the component deleted, and
     * with the page turned dynamic. It proved nothing, which is the largest
     * class in `skills/self-review.md`, and review caught it.
     *
     * This asserts the thing that can actually break: with JavaScript disabled,
     * the page still arrives complete. A component that read the session on the
     * server would not fail *this* — but `tests/unit/app/rendering-mode.test.ts`
     * and the build's route table do distinguish that, and they are where that
     * guard belongs.
     */
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");

    // Server-rendered content, not an empty shell waiting for hydration.
    await expect(page.getByRole("navigation", { name: "Murupolku" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Kotimaa" }).first()).toBeVisible();

    // And still no search, because there is no session.
    await expect(page.getByRole("searchbox", { name: "Hae joukkuetta" })).toHaveCount(0);

    await context.close();
  });
});
