import { expect, test } from "@playwright/test";

/**
 * Every public URL here is a rewrite, and `SiteHeader` decides its crumb from
 * `usePathname()`: the crumb must be in the server HTML, with no hydration
 * mismatch. A test that only waits for the element cannot see one.
 *
 * decisions/207-region-breadcrumb.md
 */

const hardLoads = [
  "/ulkomaat/ottelut",
  "/kotimaa/sarjataulukko",
  "/maajoukkueet/ottelut",
  // A region picker, where the crumb is deliberately absent on both sides.
  "/ulkomaat",
];

for (const url of hardLoads) {
  test(`hard load of ${url} hydrates without a mismatch`, async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      const text = message.text();
      if (/hydrat|did not match|server rendered HTML/i.test(text)) problems.push(text);
    });
    page.on("pageerror", (error) => problems.push(String(error)));

    await page.goto(url);

    await expect(page.getByRole("navigation", { name: "Murupolku" })).toBeVisible();
    expect(problems).toEqual([]);
  });
}
