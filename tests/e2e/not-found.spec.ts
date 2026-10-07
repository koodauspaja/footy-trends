import { expect, test } from "@playwright/test";

/**
 * The Finnish not-found page, in place of Next's default,
 * "404 – This page could not be found."
 *
 * decisions/533-finnish-error-pages.md
 * decisions/028-admin-tools-and-roles.md
 */

test.describe("Not-found page", () => {
  test("an unknown address answers 404 with a Finnish page inside the site's own frame", async ({
    page,
  }) => {
    const response = await page.goto("/ei-ole-olemassa");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Sivua ei löytynyt" })).toBeVisible();
    await expect(page.getByText("Etsimääsi sivua ei ole olemassa.")).toBeVisible();
    await expect(page).toHaveTitle("Sivua ei löytynyt");
    // Still the site: the header's breadcrumb is there to leave by.
    await expect(page.getByRole("navigation", { name: "Murupolku" })).toBeVisible();
    await expect(page.getByText("This page could not be found")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("lang", "fi");
  });

  test("its link leads to the front page", async ({ page }) => {
    await page.goto("/ei-ole-olemassa");

    await page.getByRole("main").getByRole("link", { name: "Etusivulle" }).click();

    await expect(page).toHaveURL(/\/$/);
  });

  test("the admin area shows a stranger the very same page", async ({ page }) => {
    // `notFound()` on purpose: what a signed-out visitor sees at `/yllapito`
    // must not differ from an address that does not exist.
    await page.goto("/ei-ole-olemassa");
    const unknown = await page.getByRole("main").innerText();

    await page.goto("/yllapito");

    await expect(page.getByRole("heading", { level: 1, name: "Sivua ei löytynyt" })).toBeVisible();
    expect(await page.getByRole("main").innerText()).toBe(unknown);
  });
});
