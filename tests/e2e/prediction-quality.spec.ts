import { expect, type Page, test } from "@playwright/test";
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
 */

const HEADING = "Ennusteiden osuvuus";
const SEASON = 2098;
const MATCH_ID = 999_054_001;
const MODELS = ["home-baseline-v1", "elo-v1", "poisson-v1"];

async function withDatabase(run: (sql: postgres.Sql) => Promise<unknown>) {
  const sql = postgres(testDatabaseUrl());
  try {
    await run(sql);
  } finally {
    await sql.end();
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

  test("judges all three models on the domestic backtest by default", async ({ page }) => {
    await page.goto("/ennusteet");

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
      accuracy.getByText(/^Perustaso \d{1,3} % · Elo \d{1,3} % · Poisson \d{1,3} %$/)
    ).toBeVisible();
    // A line per model once 200 matches are judged; before that, the count.
    const lines = await accuracy.locator("[data-part=line]").count();
    if (lines === 0) {
      await expect(
        accuracy.getByText(/^Liukuvaan osumatarkkuuteen tarvitaan vähintään 200 ottelua/)
      ).toBeVisible();
    } else {
      expect(lines).toBe(3);
    }

    const tables = region(page, "Brier-pistemäärä ja log-loss").getByRole("table");
    await expect(tables.nth(0).getByRole("rowheader")).toHaveText(["Perustaso", "Elo", "Poisson"]);
    await expect(tables.nth(1).getByRole("row").first().getByRole("columnheader")).toHaveText([
      "Kausi",
      "Ottelut",
      "Perustaso",
      "Elo",
      "Poisson",
    ]);

    // The diagonal and a line per model.
    await expect(region(page, "Kalibrointi").locator("[data-part=line]")).toHaveCount(4);
  });

  test("lists the competitions, and a competition's name opens the page filtered to it", async ({
    page,
  }) => {
    await page.goto("/ennusteet");

    const byCompetition = region(page, "Kilpailuittain");
    await expect(byCompetition.getByRole("columnheader")).toHaveText([
      "Kilpailu",
      "Ottelut",
      "Perustaso",
      "Elo",
      "Poisson",
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
