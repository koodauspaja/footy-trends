import { expect, test } from "@playwright/test";

/**
 * The region crumb in the header: the way from a competition page to its
 * region. The picker pages list competitions from configuration, not from a
 * provider, so following the crumb costs nothing at the API.
 *
 * decisions/207-region-breadcrumb.md
 */

const regions = [
  { name: "Kotimaa", from: "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026", to: "/kotimaa" },
  { name: "Ulkomaat", from: "/ulkomaat/ottelut?kilpailu=PL", to: "/ulkomaat" },
  { name: "Maajoukkueet", from: "/maajoukkueet/sarjataulukko", to: "/maajoukkueet" },
];

test.describe("Header breadcrumb", () => {
  for (const region of regions) {
    test(`${region.name} leads back to its competition picker`, async ({ page }) => {
      await page.goto(region.from);

      await page.getByRole("navigation", { name: "Murupolku" }).getByText(region.name).click();

      await expect(page).toHaveURL(region.to);
      await expect(page.getByRole("heading", { name: "Valitse kilpailu" })).toBeVisible();
    });
  }

  test("the region picker does not link to itself", async ({ page }) => {
    await page.goto("/ulkomaat");

    const trail = page.getByRole("navigation", { name: "Murupolku" });
    await expect(trail.getByRole("link")).toHaveCount(1);
    await expect(trail.getByRole("link", { name: "Etusivu" })).toBeVisible();
  });

  test("Etusivu still reaches the region picker", async ({ page }) => {
    await page.goto("/kotimaa/ottelut?kilpailu=VL&kausi=2026");

    await page.getByRole("link", { name: "Etusivu" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Valitse alue" })).toBeVisible();
  });
});
