import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * `Analyysit` on a national-team page (specs/041), end to end. Signed in the
 * way league-position.spec.ts explains.
 *
 * What this proves that the unit tests cannot: the section renders on a page
 * with no season and no selector, on both teams, above the year list — and
 * that every string on it names the period this page actually has.
 */

const HUUHKAJAT = "/maajoukkueet/huuhkajat";
const HELMARIT = "/maajoukkueet/helmarit";
const POSITION = "Sijoitus kierroksittain";

async function signedIn(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
}

function analytics(page: Page) {
  return page.getByRole("region", { name: "Analyysit" });
}

test.describe("National-team analytics, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signedIn(page);
  });

  for (const [team, path] of [
    ["Huuhkajat", HUUHKAJAT],
    ["Helmarit", HELMARIT],
  ] as const) {
    test(`shows the panels ${team} can have, and never a league position`, async ({ page }) => {
      await page.goto(path);
      await analytics(page).waitFor();
      const panels = await analytics(page).getByRole("heading", { level: 4 }).allTextContents();

      expect(panels.length).toBeGreaterThan(0);
      // A friendly ranks nobody, so there is no table to read a position from.
      expect(panels).not.toContain(POSITION);
      expect(panels).toContain("Vire otteluittain");
      expect(panels).toContain("Putket");
    });
  }

  test("names its groups for what they cover, not for a season", async ({ page }) => {
    await page.goto(HUUHKAJAT);
    await analytics(page).waitFor();
    const groups = await analytics(page).getByRole("heading", { level: 3 }).allTextContents();

    // specs/041, S13: the middle group covers every match since 2018, so
    // `Kausi kokonaisuutena` would claim something untrue of it.
    expect(groups).toContain("Koko historia");
    expect(groups).toContain("Muut vuodet");
    expect(groups).not.toContain("Kausi kokonaisuutena");
    expect(groups).not.toContain("Muut kaudet");
  });

  test("compares a year rather than a season", async ({ page }) => {
    await page.goto(HUUHKAJAT);
    const comparison = page.getByRole("region", { name: "Tämä vuosi verrattuna" });
    await comparison.waitFor();

    // The baseline is the team's other calendar years (specs/041, S4 and S11).
    await expect(comparison.getByText(/Verrattuna \d+ muuhun vuoteen:/)).toBeVisible();
    // A page with no table can never fill this row, so it is dropped (S7).
    await expect(comparison.locator("[data-part=row]", { hasText: "Sijoitus" })).toHaveCount(0);
    await expect(comparison.locator("[data-part=row]")).not.toHaveCount(0);
  });

  test("says how far back its records reach", async ({ page }) => {
    await page.goto(HUUHKAJAT);
    const records = page.getByRole("region", { name: "Ennätykset" });
    await records.waitFor();

    // A span of years, not a list of competitions: the records cross every
    // competition deliberately (specs/041, S12).
    await expect(records.getByText(/^\d{4}(–\d{4})?$/)).toBeVisible();
  });

  test("puts the section above the year list", async ({ page }) => {
    await page.goto(HUUHKAJAT);
    await analytics(page).waitFor();

    // The panels describe every year, so they cannot sit inside one.
    const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
    expect(headings[0]).toBe("Analyysit");
    expect(headings.slice(1).every((heading) => /^\d{4}$/.test(heading))).toBe(true);
  });

  for (const [team, path] of [
    ["Huuhkajat", HUUHKAJAT],
    ["Helmarit", HELMARIT],
  ] as const) {
    test(`says how few half-time scores ${team} has, instead of figures (specs/046)`, async ({
      page,
    }) => {
      // TASO has a half-time score for few of these internationals — about 8 of
      // 84 for Huuhkajat and one for Helmarit on production — so the panel
      // shows its note and none of its six figures.
      await page.goto(path);
      const panel = analytics(page).getByRole("region", { name: "Kääntyneet ottelut" });
      await panel.waitFor();

      await expect(panel).toContainText(
        /Puoliaikatulos on tiedossa vain \d+ ottelusta, kun otteluita on \d+\. Kääntyneitä otteluita ei lasketa\./
      );
      await expect(panel.locator("dl")).toHaveCount(0);
      await expect(page.getByText("tälle kaudelle")).toHaveCount(0);
    });
  }
});

test("sends no national-team analytics value to a signed-out reader", async ({ page }) => {
  const response = await page.goto(HUUHKAJAT);
  const html = (await response?.text()) ?? "";

  // The section and its sign-in prompt are shown, as on a club page; what a
  // signed-out reader must not get is any panel or any computed value.
  await expect(page.getByRole("heading", { name: "Vire otteluittain" })).toHaveCount(0);
  expect(html).not.toContain("Vire otteluittain");
  expect(html).not.toContain("Putket");
  expect(html).not.toContain("Tämä vuosi verrattuna");
});
