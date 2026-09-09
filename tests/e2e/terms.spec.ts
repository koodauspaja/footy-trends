import { expect, test } from "@playwright/test";

/**
 * The terms of service, from #303. Signed out throughout: Google requires both
 * this and the privacy policy reachable without an account.
 */
test.describe("Terms of service", () => {
  test("opens without signing in", async ({ page }) => {
    await page.goto("/kayttoehdot");

    await expect(page).toHaveURL(/\/kayttoehdot$/);
    await expect(page.getByRole("heading", { name: "Käyttöehdot", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tiedot tulevat muualta" })).toBeVisible();
  });

  test("the English path redirects to the Finnish one", async ({ page }) => {
    await page.goto("/terms");

    await expect(page).toHaveURL(/\/kayttoehdot$/);
  });

  test("carries football-data.org's attribution on an ordinary page", async ({ page }) => {
    // Their free tier asks for it in "a visible section of your application or
    // website", so the check is on a standings page rather than on the terms.
    // In Finnish, per CLAUDE.md — what their requirement needs is the credit,
    // and their name and link both survive the translation.
    await page.goto("/ulkomaat/sarjataulukko");

    const footer = page.getByRole("contentinfo");
    await expect(footer).toContainText("Tiedot tarjoaa football-data.org ja Suomen Palloliitto.");
    await expect(footer.getByRole("link", { name: "football-data.org" })).toHaveAttribute(
      "href",
      "https://www.football-data.org/"
    );
  });

  test("both documents are reachable from the footer", async ({ page }) => {
    await page.goto("/kotimaa");

    await page.getByRole("contentinfo").getByRole("link", { name: "Käyttöehdot" }).click();
    await expect(page).toHaveURL(/\/kayttoehdot$/);

    await page.getByRole("contentinfo").getByRole("link", { name: "Tietosuoja" }).click();
    await expect(page).toHaveURL(/\/tietosuoja$/);
  });

  test("arrives with its content before any JavaScript runs", async ({ page }) => {
    await page.route("**/*.js", (route) => route.abort());

    const response = await page.goto("/kayttoehdot");

    expect(response?.status()).toBe(200);
    await expect(page.getByText(/vanhempien kausien tietoja ei haeta uudelleen/)).toBeVisible();
  });
});
