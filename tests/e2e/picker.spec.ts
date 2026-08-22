import { expect, test } from "@playwright/test";

test.describe("Region and competition pickers", () => {
  test("chooses a region, then lists competitions and navigates to the chosen one's standings", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Valitse alue" })).toBeVisible();
    await page.getByRole("link", { name: /Ulkomaat/ }).click();

    await expect(page).toHaveURL(/\/ulkomaat/);
    await expect(page.getByRole("heading", { name: "Valitse kilpailu" })).toBeVisible();
    const bundesligaLink = page.getByRole("link", { name: /Bundesliga/ });
    await expect(bundesligaLink).toBeVisible();

    await bundesligaLink.click();

    await expect(page).toHaveURL(/\/sarjataulukko\?kilpailu=BL1/);
    await expect(page.getByRole("heading", { name: /Bundesliga/ })).toBeVisible();
  });

  test("chooses Kotimaa, then navigates to Veikkausliiga's standings", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /Kotimaa/ }).click();

    await expect(page).toHaveURL(/\/kotimaa$/);
    await expect(page.getByRole("heading", { name: "Valitse kilpailu" })).toBeVisible();
    const veikkausliigaLink = page.getByRole("link", { name: /Veikkausliiga/ });
    await expect(veikkausliigaLink).toBeVisible();

    await veikkausliigaLink.click();

    await expect(page).toHaveURL(/\/kotimaa\/sarjataulukko\?kilpailu=VL/);
    await expect(page.getByRole("heading", { name: /Veikkausliiga/ })).toBeVisible();
  });
});
