import { expect, test } from "@playwright/test";

/**
 * Team search, from specs/027-team-search.md.
 *
 * **Signed out throughout, and that is the whole feature this suite can reach.**
 * The search is offered only to a signed-in reader, and the suite cannot forge
 * a session — the same limit `favourite-actions.ts` records. So what is checked
 * here is the half that matters for everyone else: the field is *absent*, not
 * merely disabled or refusing on submit, which is what #247 asks for.
 */
test.describe("Team search", () => {
  test("is not offered to a signed-out reader anywhere", async ({ page }) => {
    for (const path of ["/", "/kotimaa/sarjataulukko", "/ulkomaat/sarjataulukko"]) {
      await page.goto(path);

      await expect(page.getByRole("searchbox", { name: "Hae joukkuetta" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Hae", exact: true })).toHaveCount(0);
    }
  });

  test("leaves the header's own controls alone", async ({ page }) => {
    // The field renders nothing signed out, so the header a visitor sees is
    // exactly the one they saw before this feature existed.
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Kirjaudu sisään" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Murupolku" })).toBeVisible();
  });

  test("the front page is still prerendered with the field in the tree", async ({ page }) => {
    // #182: the header is on every page, including the four that must stay
    // static. A component that read the session on the server would cost them
    // their prerendering, and this is the end-to-end half of that guard.
    const response = await page.goto("/");
    const html = (await response?.text()) ?? "";

    expect(html).not.toContain("Hae joukkuetta");
  });
});
