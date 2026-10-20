import { expect, type Page, test } from "@playwright/test";
import Redis from "ioredis";
import postgres from "postgres";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";
import { testDatabaseUrl } from "../support/test-database";

/**
 * `/ennusteet`, end to end. Signed in the way league-position.spec.ts explains. Whether
 * judged predictions are stored depends on what ran before, so one per model is seeded, on a
 * finished Veikkausliiga match in 2098. Whatever else is stored joins them, so no figure is
 * named.
 *
 * decisions/054-prediction-quality.md
 * decisions/055-poisson-goal-model.md
 * decisions/056-accuracy-by-competition.md
 * decisions/060-elo-variants.md
 * decisions/068-model-choice-on-ennusteet.md
 */

const HEADING = "Ennusteiden osuvuus";
const SEASON = 2098;
const MATCH_ID = 999_054_001;
const MODELS = ["home-baseline-v1", "elo-v1", "elo-form-v1", "elo-home-v1", "poisson-v1"];
const LABELS = ["Perustaso", "Elo", "Elo + vire", "Elo + kotietu", "Poisson"];

async function withDatabase(run: (sql: postgres.Sql) => Promise<unknown>) {
  const sql = postgres(testDatabaseUrl());
  try {
    await run(sql);
  } finally {
    await sql.end();
  }
}

// The domestic reports are cached for 15 minutes, so one made before the seed,
// by an earlier run or another suite, would leave the seeded match out.
async function dropReports() {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    const reports = await redis.keys("quality:v3:taso:*");
    if (reports.length > 0) await redis.del(...reports);
  } finally {
    await redis.quit();
  }
}

async function clear(sql: postgres.Sql) {
  await sql`delete from predictions where source = 'taso' and provider_match_id = ${MATCH_ID}`;
  await sql`delete from taso_matches where taso_match_id = ${MATCH_ID}`;
}

test.beforeAll(async () => {
  await withDatabase(async (sql) => {
    await clear(sql);
    const kickoff = new Date(`${SEASON}-05-01T15:00:00Z`);
    await sql`insert into taso_matches ${sql({
      taso_match_id: MATCH_ID,
      competition_id: `spljp${SEASON % 100}`,
      category_id: "VL",
      season_id: SEASON,
      group_id: 1,
      group_name: "Runkosarja",
      kickoff_at: kickoff,
      matchday: 1,
      status: "FINISHED",
      home_team_provider_id: 999_054_101,
      home_team_name: "E2E Koti",
      away_team_provider_id: 999_054_102,
      away_team_name: "E2E Vieras",
      home_goals: 2,
      away_goals: 1,
    })}`;
    await sql`insert into predictions ${sql(
      MODELS.map((model) => ({
        source: "taso",
        provider_match_id: MATCH_ID,
        competition_code: "VL",
        model,
        kind: "backtest",
        home_probability: 0.5,
        draw_probability: 0.3,
        away_probability: 0.2,
        predicted_at: kickoff,
        kickoff_at: kickoff,
      }))
    )}`;
  });
  await dropReports();
});

test.afterAll(async () => {
  await withDatabase(clear);
});

function region(page: Page, name: string) {
  return page.getByRole("region", { name });
}

test.describe("Prediction quality, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  });

  test("the home page's tile leads to the page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Ennusteet/ }).click();

    await expect(page).toHaveURL(/\/ennusteet$/);
    await expect(page.getByRole("heading", { level: 1, name: HEADING })).toBeVisible();
  });

  test("judges all five models on the default domestic backtest, all five drawn when chosen", async ({
    page,
  }) => {
    await page.goto("/ennusteet?mallit=perustaso,elo,elo-vire,elo-kotietu,poisson");

    await expect(page.getByRole("link", { name: "Kotimaa" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(page.getByRole("link", { name: "Jälkikäteen lasketut" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(
      page.getByText(
        /^[\d ]+ ottelua vuo(silta \d{4}–\d{4}|delta \d{4}), joille kaikki mallit ovat antaneet ennusteen\.$/
      )
    ).toBeVisible();

    const accuracy = region(page, "Osumatarkkuus");
    await expect(
      accuracy.getByText(
        /^Perustaso \d{1,3} % · Elo \d{1,3} % · Elo \+ vire \d{1,3} % · Elo \+ kotietu \d{1,3} % · Poisson \d{1,3} %$/
      )
    ).toBeVisible();
    // A line per model once 200 matches are judged; before that, the count.
    const lines = await accuracy.locator("[data-part=line]").count();
    if (lines === 0) {
      await expect(
        accuracy.getByText(/^Liukuvaan osumatarkkuuteen tarvitaan vähintään 200 ottelua/)
      ).toBeVisible();
    } else {
      expect(lines).toBe(5);
    }

    const tables = region(page, "Brier-pistemäärä ja log-loss").getByRole("table");
    await expect(tables.nth(0).getByRole("rowheader")).toHaveText(LABELS);
    await expect(tables.nth(1).getByRole("row").first().getByRole("columnheader")).toHaveText([
      "Kausi",
      "Ottelut",
      ...LABELS,
    ]);

    // The diagonal and a line per model.
    await expect(region(page, "Kalibrointi").locator("[data-part=line]")).toHaveCount(6);
  });

  test("lists the competitions, and a competition's name opens the page filtered to it", async ({
    page,
  }) => {
    await page.goto("/ennusteet");

    const byCompetition = region(page, "Kilpailuittain");
    await expect(byCompetition.getByRole("columnheader")).toHaveText([
      "Kilpailu",
      "Ottelut",
      ...LABELS,
    ]);
    // The row's lowest Brier score is bold: at least one in the seeded competition's row.
    const row = byCompetition.getByRole("row", { name: /Veikkausliiga/ });
    await expect(row.locator("strong").first()).toHaveText(/^\d,\d{3}$/);
    await expect(
      byCompetition.getByText(
        "Brier-pistemäärä kilpailuittain. Lihavoitu luku on kilpailun paras malli; pienempi on parempi."
      )
    ).toBeVisible();
    await expect(page.getByText(/^Näytetään vain kilpailu/)).toHaveCount(0);

    await byCompetition.getByRole("link", { name: "Veikkausliiga" }).click();

    await expect(page).toHaveURL(/\/ennusteet\?alue=kotimaa&tyyppi=jalkikateen&kilpailu=VL$/);
    await expect(page.getByText("Näytetään vain kilpailu Veikkausliiga.")).toBeVisible();
    await expect(
      region(page, "Kilpailuittain").getByRole("link", { name: "Veikkausliiga" })
    ).toHaveAttribute("aria-current", "page");
    // The seeded match is one of them, so the filtered page has figures.
    await expect(region(page, "Osumatarkkuus")).toBeVisible();

    // The kind switch keeps the competition.
    await page.getByRole("link", { name: "Ennakkoon tehdyt" }).click();
    await expect(page).toHaveURL(/\/ennusteet\?alue=kotimaa&tyyppi=ennakkoon&kilpailu=VL$/);
    await expect(page.getByText("Näytetään vain kilpailu Veikkausliiga.")).toBeVisible();

    await page.getByRole("link", { name: "Kaikki kilpailut" }).click();
    await expect(page).toHaveURL(/\/ennusteet\?alue=kotimaa&tyyppi=ennakkoon$/);
    await expect(page.getByText(/^Näytetään vain kilpailu/)).toHaveCount(0);
  });

  test("draws the baseline, Elo and Poisson by default, and a toggle shows or hides a model", async ({
    page,
  }) => {
    await page.goto("/ennusteet");
    const calibration = region(page, "Kalibrointi");
    // The diagonal and the three default models.
    await expect(calibration.locator("[data-part=line]")).toHaveCount(4);
    await expect(calibration.locator('[data-series="elo-form-v1"]')).toHaveCount(0);

    await page.getByRole("link", { name: "Elo + vire, piilotettu kaavioista" }).click();
    await expect(page).toHaveURL(
      /\/ennusteet\?alue=kotimaa&tyyppi=jalkikateen&mallit=perustaso,elo,elo-vire,poisson$/
    );
    await expect(region(page, "Kalibrointi").locator("[data-part=line]")).toHaveCount(5);

    await page.getByRole("link", { name: "Elo, näytetään kaavioissa" }).click();
    await expect(page).toHaveURL(/&mallit=perustaso,elo-vire,poisson$/);
    await expect(region(page, "Kalibrointi").locator('[data-series="elo-v1"]')).toHaveCount(0);
    // The figures in words keep all five.
    await expect(
      region(page, "Osumatarkkuus").getByText(/^Perustaso \d{1,3}\u00a0% · Elo \d{1,3}\u00a0% · /)
    ).toBeVisible();

    // The kind switch keeps the choice.
    await page.getByRole("link", { name: "Ennakkoon tehdyt" }).click();
    await expect(page).toHaveURL(
      /\/ennusteet\?alue=kotimaa&tyyppi=ennakkoon&mallit=perustaso,elo-vire,poisson$/
    );
    // Seeded as backtest rows only, so the live tab may be empty: back to the backtest.
    await page.getByRole("link", { name: "Jälkikäteen lasketut" }).click();
    await expect(page).toHaveURL(/&mallit=perustaso,elo-vire,poisson$/);
    await expect(page.getByRole("link", { name: "Elo, piilotettu kaavioista" })).toBeVisible();
  });

  test("keeps the last shown model from being hidden", async ({ page }) => {
    await page.goto("/ennusteet?mallit=poisson");

    await expect(page.getByText("Poisson, näytetään kaavioissa")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Poisson, / })).toHaveCount(0);
    await expect(region(page, "Kalibrointi").locator("[data-part=line]")).toHaveCount(2);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`tells a shown toggle from a hidden one by weight, in ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/ennusteet");

      const weight = (name: string) =>
        page
          .getByRole("link", { name })
          .evaluate((element) => Number(getComputedStyle(element).fontWeight));
      expect(await weight("Elo, näytetään kaavioissa")).toBeGreaterThanOrEqual(600);
      expect(await weight("Elo + vire, piilotettu kaavioista")).toBeLessThan(600);
    });
  }

  test.describe("at 375 px", () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test("wraps the toggles within the page, and they still choose", async ({ page }) => {
      await page.goto("/ennusteet");
      const toggles = page.getByRole("list", { name: "Kaavioissa näytetään:" });
      await expect(toggles.getByRole("listitem")).toHaveCount(5);

      const box = await toggles.boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);

      await page.getByRole("link", { name: "Elo + kotietu, piilotettu kaavioista" }).click();
      await expect(page).toHaveURL(/&mallit=perustaso,elo,elo-kotietu,poisson$/);
    });

    test("scrolls the five-column tables within their boxes, never the page", async ({ page }) => {
      await page.goto("/ennusteet");
      await expect(region(page, "Kilpailuittain").getByRole("table")).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
      for (const table of [
        region(page, "Kilpailuittain").getByRole("table"),
        region(page, "Brier-pistemäärä ja log-loss").getByRole("table").nth(1),
      ]) {
        // Five models' columns do not fit: the box scrolls, and is no wider than the page.
        const box = await table.evaluate((element) => {
          const parent = element.parentElement as HTMLElement;
          return {
            overflowX: getComputedStyle(parent).overflowX,
            width: parent.clientWidth,
            content: parent.scrollWidth,
          };
        });
        expect(box.overflowX).toBe("auto");
        expect(box.width).toBeLessThanOrEqual(375);
        expect(box.content).toBeGreaterThan(box.width);
      }
    });
  });

  test("the provider switch drops the competition, and another provider's is ignored", async ({
    page,
  }) => {
    await page.goto("/ennusteet?kilpailu=VL");
    await expect(page.getByText("Näytetään vain kilpailu Veikkausliiga.")).toBeVisible();

    await page.getByRole("link", { name: "Ulkomaat" }).click();
    await expect(page).toHaveURL(/\/ennusteet\?alue=ulkomaat&tyyppi=jalkikateen$/);
    await expect(page.getByText(/^Näytetään vain kilpailu/)).toHaveCount(0);

    await page.goto("/ennusteet?alue=ulkomaat&kilpailu=VL");
    await expect(page.getByRole("heading", { level: 1, name: HEADING })).toBeVisible();
    await expect(page.getByText(/^Näytetään vain kilpailu/)).toHaveCount(0);
  });

  test("the switches keep each other's choice", async ({ page }) => {
    await page.goto("/ennusteet");
    await page.getByRole("link", { name: "Ennakkoon tehdyt" }).click();
    await expect(page).toHaveURL(/\/ennusteet\?alue=kotimaa&tyyppi=ennakkoon$/);

    await page.getByRole("link", { name: "Ulkomaat" }).click();
    await expect(page).toHaveURL(/\/ennusteet\?alue=ulkomaat&tyyppi=ennakkoon$/);
    await expect(page.getByRole("link", { name: "Ennakkoon tehdyt" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});

test.describe("Prediction quality, signed out", () => {
  test("asks to sign in and carries no figure", async ({ page }) => {
    const response = await page.goto("/ennusteet");
    const html = (await response?.text()) ?? "";

    await expect(page.getByText("Kirjaudu sisään nähdäksesi ennusteiden osuvuuden.")).toBeVisible();
    expect(html).not.toContain("Osumatarkkuus");
    expect(html).not.toContain("Brier");
  });
});
