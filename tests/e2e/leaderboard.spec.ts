import { randomUUID } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { e2eAppPort } from "../../scripts/e2e-target";
import { SESSION_COOKIE, storeSignedInReader } from "../support/e2e-session";
import { testDatabaseUrl } from "../support/test-database";

/**
 * Arvauspeli's leaderboard as players meet it: two join and guess one match,
 * one with a nickname, and both see the board; a signed-out reader sees none.
 *
 * decisions/073-leaderboard.md
 */

const PORT = e2eAppPort(process.env);
// The season `guessing-game.spec.ts` plays in, with match ids and teams of its own.
const SEASON = 2199;
const MATCH_ID = 999_700_000 + PORT;
const HOME = `E2E Taulu Koti ${PORT}`;
const AWAY = `E2E Taulu Vieras ${PORT}`;
const DAY = 24 * 60 * 60 * 1000;

async function withDatabase(run: (sql: postgres.Sql) => Promise<unknown>) {
  const sql = postgres(testDatabaseUrl());
  try {
    await run(sql);
  } finally {
    await sql.end();
  }
}

async function signedInPage(browser: Browser, cookie: string, baseURL: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: baseURL }]);
  return context.newPage();
}

async function joinAndGuess(page: Page, outcome: "1" | "X") {
  await page.goto("/arvauspeli");
  await page.getByRole("button", { name: "Liity peliin" }).click();
  const row = page.getByRole("listitem").filter({ hasText: `${HOME} – ${AWAY}` });
  await row.getByRole("radio", { name: outcome }).check();
  await row.getByRole("button", { name: "Arvaa" }).click();
  await expect(row.getByText(`Arvauksesi: ${outcome}`)).toBeVisible();
}

test.describe("the Arvauspeli leaderboard", () => {
  let named: Awaited<ReturnType<typeof storeSignedInReader>>;
  let nameless: Awaited<ReturnType<typeof storeSignedInReader>>;

  test.beforeAll(async () => {
    named = await storeSignedInReader("user");
    nameless = await storeSignedInReader("user");
    await withDatabase(async (sql) => {
      await sql`delete from taso_matches where taso_match_id = ${MATCH_ID}`;
      await sql`insert into taso_matches ${sql({
        taso_match_id: MATCH_ID,
        competition_id: `spljp${SEASON % 100}`,
        category_id: "VL",
        season_id: SEASON,
        group_id: 1,
        group_name: "Runkosarja",
        kickoff_at: new Date(Date.now() + 10 * DAY),
        matchday: 1,
        status: "SCHEDULED",
        home_team_provider_id: MATCH_ID,
        home_team_name: HOME,
        away_team_provider_id: MATCH_ID + 1_000_000_000,
        away_team_name: AWAY,
        home_goals: null,
        away_goals: null,
      })}`;
    });
  });

  test.afterAll(async () => {
    await named?.remove();
    await nameless?.remove();
    await withDatabase((sql) => sql`delete from taso_matches where taso_match_id = ${MATCH_ID}`);
  });

  test("ranks both players, one by nickname and one as Nimetön pelaaja", async ({
    browser,
    baseURL,
  }) => {
    const nickname = `Taulu${PORT}${randomUUID().slice(0, 4)}`;
    const page = await signedInPage(browser, named.cookie, baseURL as string);
    await page.goto("/asetukset");
    await page.getByLabel("Nimimerkki").fill(nickname);
    await page.getByRole("button", { name: "Tallenna nimimerkki" }).click();
    await expect(page.getByText("Nimimerkki tallennettu.")).toBeVisible();
    await joinAndGuess(page, "1");

    const other = await signedInPage(browser, nameless.cookie, baseURL as string);
    await joinAndGuess(other, "X");

    await page.reload();
    await expect(page.getByRole("heading", { name: "Tulostaulukko", level: 2 })).toBeVisible();
    const ownRow = page.getByRole("row").filter({ hasText: nickname });
    await expect(ownRow).toContainText("(sinä)");
    await expect(ownRow).toContainText("990");
    await expect(page.getByRole("row").filter({ hasText: "Nimetön pelaaja" })).not.toHaveCount(0);
    await expect(page.getByText(/^\(\d+ pelaaja/)).toBeVisible();

    await other.context().close();
    await page.context().close();
  });

  test("is not shown to a signed-out reader", async ({ page }) => {
    await page.goto("/arvauspeli");

    await expect(page.getByText("Kirjaudu sisään pelataksesi.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tulostaulukko" })).toHaveCount(0);
  });
});
