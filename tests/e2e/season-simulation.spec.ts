import { expect, test } from "@playwright/test";
import Redis from "ioredis";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * `Kauden ennuste` on a league's standings page, end to end, on the Premier
 * League's real season in progress. Signed in the way league-position.spec.ts
 * explains. No value is named: the figures move with every result. Between
 * seasons the newest season has nothing left to play, and the panel says so.
 *
 * decisions/061-season-simulation.md
 */

const PL = "/ulkomaat/sarjataulukko?kilpailu=PL";
const HEADING = "Kauden ennuste";
const NO_FIXTURES = "Kaudella ei ole enää pelaamattomia otteluita.";
const CHANCE = /^(<\s1|>\s99|\d{1,3})\s%$/;

// The fit and the forecast are cached for 15 minutes. On a database that held
// no Premier League match when another spec had the fit made, the fit has no
// such competition and the page no panel, so both are dropped once the seasons
// are stored.
async function dropCaches() {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    const forecasts = await redis.keys("forecast:v1:football-data:PL:*");
    await redis.del("poisson:v1:football-data", ...forecasts);
  } finally {
    await redis.quit();
  }
}

test.describe("Season forecast, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  });

  test("a league in progress shows every team's forecast first in Tämä kausi", async ({ page }) => {
    // Opening a season stores it: the season in progress and the one before
    // it, so the fit has Premier League matches whatever the time of year.
    await page.goto(PL);
    const seasons = await page
      .getByLabel("Kausi")
      .locator("option")
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    await page.goto(`${PL}&kausi=${seasons[1]}`);
    await dropCaches();

    await page.goto(PL);
    const group = page.getByRole("region", { name: "Tämä kausi" });
    await expect(group.getByRole("heading", { level: 4 }).first()).toHaveText(HEADING);
    const panel = group.getByRole("region", { name: HEADING });
    await expect(panel).toBeVisible();
    if ((await panel.getByText(NO_FIXTURES).count()) > 0) return;

    await expect(panel.getByRole("columnheader")).toHaveText([
      "Joukkue",
      "Odotetut pisteet",
      "Mestaruus",
      "Kolmen parhaan joukossa",
      "Kolmen huonoimman joukossa",
    ]);
    // The standings table is the page's first: the forecast lists the same
    // teams in the same order.
    const standings = await page.locator("table").first().locator("tbody tr th").allTextContents();
    await expect(panel.getByRole("rowheader")).toHaveText(standings);
    const cells = await panel.locator("tbody tr").first().getByRole("cell").allTextContents();
    expect(cells[0]).toMatch(/^\d{1,3},\d$/);
    for (const chance of cells.slice(1)) expect(chance).toMatch(CHANCE);
    await expect(
      panel.getByText(/^Jäljellä olevat ottelut on pelattu 10 000 kertaa/)
    ).toBeVisible();

    await panel.getByRole("link", { name: "Kuinka hyvin ennusteet ovat osuneet?" }).click();
    await expect(page).toHaveURL(/\/ennusteet\?alue=ulkomaat&tyyppi=jalkikateen&kilpailu=PL$/);
  });

  test("a finished season has no forecast", async ({ page }) => {
    await page.goto(PL);
    const seasons = await page
      .getByLabel("Kausi")
      .locator("option")
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));

    await page.goto(`${PL}&kausi=${seasons[1]}`);

    await expect(page.getByRole("region", { name: "Tämä kausi" })).toBeVisible();
    await expect(page.getByRole("region", { name: HEADING })).toHaveCount(0);
  });
});

test.describe("Season forecast, signed out", () => {
  test("the page carries no forecast", async ({ page }) => {
    const response = await page.goto(PL);
    const html = (await response?.text()) ?? "";

    expect(html).toContain("<h1");
    expect(html).not.toContain(HEADING);
    expect(html).not.toContain("Odotetut pisteet");
  });
});
