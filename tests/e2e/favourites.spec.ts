import { expect, test } from "@playwright/test";
import { signedInAs, waitForSession } from "./session";

/**
 * Favourites, from specs/026-favourites.md.
 *
 * The star is a client component that reads the session the browser already
 * has, so — unlike `/asetukset`, whose boundary `settings.spec.ts` documents —
 * intercepting `/api/auth/get-session` really does reach what it renders. What
 * it cannot reach is a *write*: the server action reads a real cookie, sees
 * none, and refuses. So this file covers what is shown, and the writes are
 * covered by the unit and integration suites.
 */
test.describe("Favourites, signed out", () => {
  test("explains itself instead of redirecting", async ({ page }) => {
    await page.goto("/suosikit");

    await expect(page).toHaveURL(/\/suosikit$/);
    await expect(page.getByRole("heading", { name: "Suosikit" })).toBeVisible();
    await expect(page.getByText("Kirjaudu sisään nähdäksesi suosikkisi.")).toBeVisible();
  });

  test("is reachable on the Finnish URL, and the English one redirects", async ({ page }) => {
    await page.goto("/favorites");

    await expect(page).toHaveURL(/\/suosikit$/);
  });

  test("offers no star on a standings table", async ({ page }) => {
    // There is no identity to attach a favourite to, so the control is absent
    // rather than present and disabled.
    await page.goto("/kotimaa/sarjataulukko");
    // The stars are client-rendered, so "none yet" is true of any page before
    // it hydrates. Waiting for the signed-out header proves the session
    // resolved and this assertion is about the answer rather than the timing.
    await expect(page.getByRole("button", { name: "Kirjaudu sisään" })).toBeVisible();

    await expect(page.getByRole("button", { name: /^Lisää suosikkeihin/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Poista suosikeista/ })).toHaveCount(0);
  });

  test("offers no star in the region picker", async ({ page }) => {
    await page.goto("/kotimaa");
    await expect(page.getByRole("button", { name: "Kirjaudu sisään" })).toBeVisible();

    await expect(page.getByRole("button", { name: /suosik/i })).toHaveCount(0);
  });
});

test.describe("Favourites, signed in", () => {
  test("puts a star beside each competition in the picker", async ({ page }) => {
    await signedInAs(page, "Matti Meikäläinen", null, { competitions: ["kotimaa:VL"] });
    await page.goto("/kotimaa");
    await waitForSession(page);

    // The one already favourited reads as pressed; the rest as not.
    await expect(
      page.getByRole("button", { name: "Poista suosikeista: Veikkausliiga" })
    ).toHaveAttribute("aria-pressed", "true");
    // Exact: `Ykkösliigacup` is also on this page, and a substring match would
    // resolve to two buttons.
    await expect(
      page.getByRole("button", { name: "Lisää suosikkeihin: Ykkösliiga", exact: true })
    ).toHaveAttribute("aria-pressed", "false");
  });

  test("keeps the picker pages prerendered even with a client star on them", async ({ page }) => {
    /**
     * The risk this feature actually ran (#182): a toggle on `/kotimaa` costing
     * the page its prerendering. `tests/unit/app/rendering-mode.test.ts` guards
     * the build output; this checks the page still arrives with its content in
     * the HTML, before any JavaScript runs.
     */
    await page.route("**/*.js", (route) => route.abort());
    const response = await page.goto("/kotimaa");

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("link", { name: "Veikkausliiga" })).toBeVisible();
  });

  test("puts a star on every standings row", async ({ page }) => {
    await signedInAs(page, "Matti Meikäläinen");
    await page.goto("/kotimaa/sarjataulukko");
    await waitForSession(page);

    const stars = page.getByRole("button", { name: /^Lisää suosikkeihin/ });
    // The rows are server-rendered but the stars are not, so the first one has
    // to arrive before counting them means anything.
    await expect(stars.first()).toBeVisible();

    const rows = await page.locator("tbody tr").count();
    expect(await stars.count()).toBe(rows);
    /**
     * Each star names its own team: twenty identical buttons would be unusable
     * with a screen reader. Scoped to one table, because a Veikkausliiga season
     * splits into a runkosarja and two jatkosarjat — the same club really does
     * appear in two of them, and really does get a star in each.
     */
    const labels = await page
      .locator("table")
      .first()
      .locator("button[aria-label]")
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
    expect(labels.length).toBeGreaterThan(1);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test("reaches the favourites page from the account menu", async ({ page }) => {
    await signedInAs(page, "Matti Meikäläinen");
    await page.goto("/kotimaa");
    await waitForSession(page);

    await page.getByRole("button", { name: /^Tili:/ }).click();
    await page.getByRole("link", { name: "Suosikit" }).click();

    await expect(page).toHaveURL(/\/suosikit$/);
  });
});
