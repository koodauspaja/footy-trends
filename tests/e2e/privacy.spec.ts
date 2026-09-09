import { expect, test } from "@playwright/test";

/**
 * The privacy policy, from #302.
 *
 * The requirement it exists for is *reachability*: Google will not let the OAuth
 * consent screen leave Testing without a policy anyone can open, so every
 * assertion here is made signed out.
 */
test.describe("Privacy policy", () => {
  test("opens without signing in", async ({ page }) => {
    await page.goto("/tietosuoja");

    await expect(page).toHaveURL(/\/tietosuoja$/);
    await expect(page.getByRole("heading", { name: "Tietosuojaseloste", level: 1 })).toBeVisible();
    // Signed out, and still the whole page — no prompt, no empty state.
    await expect(page.getByRole("button", { name: "Kirjaudu sisään" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mitä tietoja tallennetaan" })).toBeVisible();
  });

  test("is reachable from every page, through the footer", async ({ page }) => {
    await page.goto("/kotimaa");

    await page.getByRole("contentinfo").getByRole("link", { name: "Tietosuoja" }).click();

    await expect(page).toHaveURL(/\/tietosuoja$/);
  });

  test("the English path redirects to the Finnish one", async ({ page }) => {
    await page.goto("/privacy");

    await expect(page).toHaveURL(/\/tietosuoja$/);
  });

  test("arrives with its content before any JavaScript runs", async ({ page }) => {
    // Google's crawler and a reader with a blocked script both have to see it,
    // which is what being prerendered buys.
    await page.route("**/*.js", (route) => route.abort());

    const response = await page.goto("/tietosuoja");

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Tietosuojaseloste", level: 1 })).toBeVisible();
    await expect(page.getByText("Poista tili")).toBeVisible();
  });
});
