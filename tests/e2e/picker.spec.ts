import { expect, test } from "@playwright/test";

test.describe("Competition picker", () => {
  test("lists competitions and navigates to the chosen one's standings", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Valitse kilpailu" })).toBeVisible();
    const bundesligaLink = page.getByRole("link", { name: /Bundesliga/ });
    await expect(bundesligaLink).toBeVisible();

    await bundesligaLink.click();

    await expect(page).toHaveURL(/\/sarjataulukko\?kilpailu=BL1/);
    await expect(page.getByRole("heading", { name: /Bundesliga/ })).toBeVisible();
  });
});
