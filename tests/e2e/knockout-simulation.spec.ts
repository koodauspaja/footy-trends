import { expect, type Page, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";
import { dropCached } from "../support/e2e-redis";

/**
 * The Champions League's `Kauden ennuste`, end to end, on the stored season in
 * progress. Signed in the way league-position.spec.ts explains. No value is
 * named: the figures move with every result.
 *
 * decisions/067-knockout-simulation.md
 */

const STANDINGS = "/ulkomaat/sarjataulukko?kilpailu=CL";
const HEADING = "Kauden ennuste";
const CHANCE = /^(<\s1|>\s99|\d{1,3})\s%$/;

// The fit and the forecast are cached for 15 minutes: dropped, so the page
// computes them from the rows stored now.
async function dropCaches() {
  await dropCached("poisson:v1:football-data", "knockout:v1:football-data:*");
}

function forecastPanel(page: Page) {
  return page.getByRole("region", { name: "Tämä kausi" }).getByRole("region", { name: HEADING });
}

function headers(table: ReturnType<Page["getByRole"]>) {
  return table.getByRole("columnheader").allTextContents();
}

test.describe("Champions League forecast, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
    await dropCaches();
  });

  test("the season in progress shows its forecast first in Tämä kausi", async ({ page }) => {
    await page.goto(STANDINGS);
    const group = page.getByRole("region", { name: "Tämä kausi" });

    await expect(group.getByRole("heading", { level: 4 }).first()).toHaveText(HEADING);
    const tables = forecastPanel(page).getByRole("table");
    // The league phase has fixtures left in the stored season: its table first.
    await expect(tables).toHaveCount(2);
    expect(await headers(tables.first())).toEqual([
      "Joukkue",
      "Odotetut pisteet",
      "Sijat 1–8",
      "Sijat 9–24",
      "Sijat 25–36",
    ]);
    expect(await headers(tables.last())).toEqual([
      "Joukkue",
      "Neljännesvälierät",
      "Puolivälierät",
      "Välierät",
      "Loppuottelu",
      "Mestaruus",
    ]);
    await expect(tables.first().getByRole("row")).toHaveCount(37);
  });

  test("prints every open chance as a whole percent, never 0 % or 100 %", async ({ page }) => {
    await page.goto(STANDINGS);
    const knockout = forecastPanel(page).getByRole("table").last();
    // The title column: nothing is decided while the league phase is played.
    await expect(knockout.locator("tbody tr")).not.toHaveCount(0);
    const titles = await knockout.locator("tbody tr td:last-child").allTextContents();

    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) {
      expect(title).toMatch(CHANCE);
      expect(title).not.toMatch(/^(0|100)\s%$/);
    }
  });

  test("says what the figures are and links to the model's record", async ({ page }) => {
    await page.goto(STANDINGS);
    const panel = forecastPanel(page);

    await expect(panel.getByText(/^Loppukausi on pelattu 10 000 kertaa/)).toBeVisible();
    await expect(
      panel.getByRole("link", { name: "Kuinka hyvin ennusteet ovat osuneet?" })
    ).toHaveAttribute("href", /\/ennusteet\?.*kilpailu=CL/);
  });

  test("a finished season shows no forecast", async ({ page }) => {
    await page.goto(`${STANDINGS}&kausi=2024`);

    await expect(page.getByRole("region", { name: "Tämä kausi" })).toBeVisible();
    await expect(forecastPanel(page)).toHaveCount(0);
  });
});

test("sends no figure to a signed-out reader", async ({ page }) => {
  const response = await page.goto(STANDINGS);
  const html = (await response?.text()) ?? "";

  expect(html).not.toContain(HEADING);
  expect(html).not.toContain("Odotetut pisteet");
  expect(html).not.toContain("Loppukausi on pelattu");
});
