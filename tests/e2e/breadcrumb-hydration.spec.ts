import { expect, test } from "@playwright/test";

/**
 * `SiteHeader` is a client component that decides its crumb from
 * `usePathname()`, and every public URL here is a rewrite — `/ulkomaat/ottelut`
 * is served from `/foreign/matches`. If the server rendered the header from the
 * internal destination while the browser resolved the public path, the crumb
 * would be missing from the server HTML and appear only after hydration, with a
 * mismatch in between.
 *
 * It does not: `usePathname()` reports the public path on both sides. These
 * specs hold that, because it is the kind of thing a Next upgrade could change
 * quietly, and a hydration mismatch is invisible to a test that merely waits
 * for the element to appear.
 *
 * Raised in review on #207.
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
