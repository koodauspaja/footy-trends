import { expect, test } from "@playwright/test";

test.describe("Champions League standings", () => {
  test("renders one league-phase table and the knockout bracket for 2024/25", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=CL&kausi=2024");

    await expect(page.getByRole("heading", { name: "Mestarien liiga 2024/25" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Liigavaihe" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Lohko/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Pudotuspelit" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Loppuottelu" })).toBeVisible();
  });

  test("renders eight group tables for the group-stage season 2023/24", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=CL&kausi=2023");

    await expect(page.getByRole("heading", { name: /^Lohko [A-H]$/ })).toHaveCount(8);
    await expect(page.getByRole("heading", { name: "Liigavaihe" })).toHaveCount(0);
  });

  test("has no round selector, unlike a league competition", async ({ page }) => {
    await page.goto("/ulkomaat/sarjataulukko?kilpailu=CL");

    await expect(page.getByLabel("Kilpailu")).toBeVisible();
    await expect(page.getByLabel("Kausi")).toBeVisible();
    await expect(page.getByLabel("Kierros")).toHaveCount(0);
  });

  test("offers a stage selector on the match list, and switching updates the URL", async ({
    page,
  }) => {
    await page.goto("/ulkomaat/ottelut?kilpailu=CL&kausi=2024");

    await expect(page.getByLabel("Vaihe")).toBeVisible();
    await expect(page.getByLabel("Kierros")).toHaveCount(0);

    await page.getByLabel("Vaihe").selectOption("QUARTER_FINALS");
    await expect(page).toHaveURL(/vaihe=QUARTER_FINALS/);
    await expect(page.getByRole("heading", { name: /puolivälierät/ })).toBeVisible();
  });

  test("reaches the cup from the competition picker", async ({ page }) => {
    await page.goto("/ulkomaat");

    await page.getByRole("link", { name: "Mestarien liiga" }).click();
    await expect(page).toHaveURL(/kilpailu=CL/);
    await expect(page.getByRole("heading", { name: /Mestarien liiga/ })).toBeVisible();
  });
});
