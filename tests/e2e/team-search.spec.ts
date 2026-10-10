import { expect, test } from "@playwright/test";

/**
 * Team search, signed out throughout: the search is offered only to a signed-in
 * reader, and the suite forges no session. What is checked is that the field is
 * absent, not merely disabled or refusing on submit.
 *
 * decisions/027-team-search.md
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

    await expect(
      page.getByRole("banner").getByRole("button", { name: "Kirjaudu sisään" })
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Murupolku" })).toBeVisible();
  });

  test("the front page still serves its content without JavaScript", async ({ browser }) => {
    // With JavaScript disabled the page still arrives complete. That the HTML lacks
    // `Hae joukkuetta` would prove nothing: the server has no session to render it for.
    // Whether the page stayed static is `tests/unit/app/rendering-mode.test.ts`'s to guard.
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
