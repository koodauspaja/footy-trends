import { expect, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * `Vaikeimmat vastustajat`, end to end. Signed in the way league-position.spec.ts
 * explains. What real data can prove: a row's record is the head-to-head page's
 * record for the same pair, so following the link never shows different numbers.
 *
 * decisions/045-bogey-teams.md
 */

// FC Inter, a Veikkausliiga club with years of stored seasons behind it.
const INTER = "/kotimaa/joukkue/60987";

test.describe("Bogey teams, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  });

  test("names at most three opponents under Vastustajat, last of the groups", async ({ page }) => {
    await page.goto(INTER);
    const panel = page.getByRole("region", { name: "Vaikeimmat vastustajat" });
    await panel.waitFor();

    const groups = await page.getByRole("heading", { level: 3 }).allTextContents();
    expect(groups.at(-1)).toBe("Vastustajat");
    const rows = panel.locator("tbody tr");
    expect(await rows.count()).toBeGreaterThan(0);
    expect(await rows.count()).toBeLessThanOrEqual(3);
    await expect(panel.getByText(/^Vähintään 3 kohtaamista\. Perustuu kaudesta/)).toBeVisible();
  });

  test("a row's record is the head-to-head page's record for that pair", async ({ page }) => {
    await page.goto(INTER);
    const panel = page.getByRole("region", { name: "Vaikeimmat vastustajat" });
    const first = panel.locator("tbody tr").first();
    await first.waitFor();

    // The four counts only: `P/O` is a decimal-comma rate this test does not
    // compare, and `Number("0,9")` is NaN (Sourcery, on this pull request).
    const [played, wins, draws, losses] = (await first.locator("td").allTextContents())
      .slice(0, 4)
      .map(Number);
    const opponent = (await first.getByRole("link").textContent()) ?? "";
    await first.getByRole("link").click();
    await page.getByRole("heading", { level: 1, name: /^Kohtaamiset: / }).waitFor();

    await expect(page.getByText(new RegExp(`^${played} ottelua?, `))).toBeVisible();
    await expect(
      page.getByText(`FC Inter ${wins} – ${draws} tasan – ${losses} ${opponent}`)
    ).toBeVisible();
  });

  test("shows the same opponents whichever season the page shows", async ({ page }) => {
    // Opening a season stores it, and the panel reads every stored season, so
    // on a fresh database the first read can see fewer meetings than a later
    // one. Both seasons are stored first, then compared.
    const rows = async (url: string) => {
      await page.goto(url);
      const panel = page.getByRole("region", { name: "Vaikeimmat vastustajat" });
      await panel.waitFor();
      return panel.locator("tbody tr").allTextContents();
    };
    const THEN = `${INTER}?kilpailu=VL&kausi=2022`;
    await rows(THEN);

    const now = await rows(INTER);
    const then = await rows(THEN);

    expect(then).toEqual(now);
  });
});

test("the national-team pages have no opponents panel", async ({ page }) => {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  await page.goto("/maajoukkueet/huuhkajat");
  await page.getByRole("heading", { level: 2, name: "Analyysit" }).waitFor();

  await expect(page.getByRole("heading", { name: "Vaikeimmat vastustajat" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 3, name: "Vastustajat" })).toHaveCount(0);
});
