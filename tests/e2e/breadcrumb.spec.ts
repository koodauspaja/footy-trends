import { expect, test } from "@playwright/test";

/**
 * #207: from a competition page the only way out used to be `Etusivu` and the
 * front page. The header now carries the region too.
 *
 * The picker pages themselves are cheap to reach — they list competitions from
 * configuration rather than from a provider — so following the crumb costs
 * nothing at the API.
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
