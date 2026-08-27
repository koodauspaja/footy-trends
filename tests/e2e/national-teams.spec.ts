import { expect, test } from "@playwright/test";

test.describe("Maajoukkueet", () => {
  test("reaches the region from the landing page", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: /Maajoukkueet/ })).toBeVisible();
    await page.getByRole("link", { name: /Maajoukkueet/ }).click();
    await expect(page).toHaveURL(/\/maajoukkueet$/);
    await expect(page.getByRole("link", { name: "MM-kisat" })).toBeVisible();
    await expect(page.getByRole("link", { name: "EM-kisat" })).toBeVisible();
  });

  test("renders the World Cup's twelve groups and its bracket", async ({ page }) => {
    await page.goto("/maajoukkueet/sarjataulukko?kilpailu=WC&kausi=2026");

    await expect(page.getByRole("heading", { name: "MM-kisat 2026" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /^Lohko [A-L]$/ })).toHaveCount(12);
    await expect(page.getByRole("heading", { name: "Pudotuspelit" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Loppuottelu" })).toBeVisible();
    // Only the World Cup has these two.
    await expect(page.getByRole("heading", { name: "Kahdeksannesvälierät" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pronssiottelu" })).toBeVisible();
  });

  test("renders the Euro's six groups, without the World Cup's extra rounds", async ({ page }) => {
    await page.goto("/maajoukkueet/sarjataulukko?kilpailu=EC&kausi=2024");

    await expect(page.getByRole("heading", { name: "EM-kisat 2024" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /^Lohko [A-F]$/ })).toHaveCount(6);
    await expect(page.getByRole("heading", { name: "Kahdeksannesvälierät" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Pronssiottelu" })).toHaveCount(0);
  });

  test("shows country names in Finnish", async ({ page }) => {
    await page.goto("/maajoukkueet/sarjataulukko?kilpailu=WC&kausi=2026");

    await expect(page.getByText("Alankomaat").first()).toBeVisible();
    await expect(page.getByText("Netherlands")).toHaveCount(0);
    await expect(page.getByText("Ivory Coast")).toHaveCount(0);
  });

  test("offers only the season, and only the season that exists", async ({ page }) => {
    await page.goto("/maajoukkueet/sarjataulukko?kilpailu=WC");

    await expect(page.getByLabel("Kilpailu")).toHaveCount(0);
    await expect(page.getByLabel("Kausi").locator("option")).toHaveText(["2026"]);
  });

  test("shows no leg column, since no round is two-legged", async ({ page }) => {
    await page.goto("/maajoukkueet/ottelut?kilpailu=EC&kausi=2024&vaihe=QUARTER_FINALS");

    await expect(page.getByRole("columnheader", { name: "Osaottelu" })).toHaveCount(0);
  });

  test("keeps Ulkomaat free of the tournaments", async ({ page }) => {
    await page.goto("/ulkomaat");

    await expect(page.getByRole("link", { name: "MM-kisat" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "EM-kisat" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Mestarien liiga" })).toBeVisible();
  });

  test("redirects the English spelling of the region", async ({ page }) => {
    await page.goto("/national-teams");

    await expect(page).toHaveURL(/\/maajoukkueet$/);
  });
});
