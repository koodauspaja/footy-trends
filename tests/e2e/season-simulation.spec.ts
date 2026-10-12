import { expect, type Page, test } from "@playwright/test";
import Redis from "ioredis";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";

/**
 * `Kauden ennuste` on a league's standings page, end to end, on a real season
 * in progress: the Premier League's, or Série A's while that is between
 * seasons. Signed in the way league-position.spec.ts explains. No value is
 * named: the figures move with every result.
 *
 * decisions/061-season-simulation.md
 */

const STANDINGS = (code: string) => `/ulkomaat/sarjataulukko?kilpailu=${code}`;
const PL = STANDINGS("PL");
// The Premier League plays from August to May and Série A from April to
// December: whatever the time of year, one of them has fixtures left.
const LEAGUES = ["PL", "BSA"];
const HEADING = "Kauden ennuste";
const CHANCE = /^(<\s1|>\s99|\d{1,3})\s%$/;

// The fit and the forecasts are cached for 15 minutes. On a database that held
// none of a league's matches when another spec had the fit made, the fit has
// no such competition and the page no panel, so both are dropped once the
// seasons are stored.
async function dropCaches() {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    const forecasts = await redis.keys("forecast:v1:football-data:*");
    await redis.del("poisson:v1:football-data", ...forecasts);
  } finally {
    await redis.quit();
  }
}

function seasonsOffered(page: Page) {
  return page
    .getByLabel("Kausi")
    .locator("option")
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
}

function forecastPanel(page: Page) {
  return page.getByRole("region", { name: "Tämä kausi" }).getByRole("region", { name: HEADING });
}

test.describe("Season forecast, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  });

  test("a league in progress shows every team's forecast first in Tämä kausi", async ({ page }) => {
    // Opening a season stores it: each league's season in progress and the
    // one before it, so the fit has its matches.
    for (const code of LEAGUES) {
      await page.goto(STANDINGS(code));
      const [, previous] = await seasonsOffered(page);
      if (previous !== undefined) await page.goto(`${STANDINGS(code)}&kausi=${previous}`);
    }
    await dropCaches();

    // The first of the leagues with a fixture left to play.
    let league: string | undefined;
    for (const code of LEAGUES) {
      await page.goto(STANDINGS(code));
      await expect(forecastPanel(page)).toBeVisible();
      if ((await forecastPanel(page).getByRole("table").count()) > 0) {
        league = code;
        break;
      }
    }
    expect(league, "neither league has a fixture left to play").toBeDefined();

    const group = page.getByRole("region", { name: "Tämä kausi" });
    await expect(group.getByRole("heading", { level: 4 }).first()).toHaveText(HEADING);
    const panel = forecastPanel(page);
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
    await expect(page).toHaveURL(
      new RegExp(`/ennusteet\\?alue=ulkomaat&tyyppi=jalkikateen&kilpailu=${league}$`)
    );
  });

  test("a finished season has no forecast", async ({ page }) => {
    await page.goto(PL);
    const [, previous] = await seasonsOffered(page);

    await page.goto(`${PL}&kausi=${previous}`);

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
