import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { e2eAppPort } from "../../scripts/e2e-target";
import { SESSION_COOKIE, storeSignedInReader } from "../support/e2e-session";
import { testDatabaseUrl } from "../support/test-database";

/**
 * Arvauspeli as a player meets it: signed out, the way in; signed in, joining,
 * a 1X2 guess, and a change to a score, each paid from the balance shown. Its
 * two matches are seeded in a season after every other spec's, with ids and
 * names carrying the run's port, so it passes on an empty database and live
 * runs on other ports never touch each other's rows.
 *
 * decisions/072-match-guesses.md
 */

const PORT = e2eAppPort(process.env);
const SEASON = 2199;
const MATCH_IDS = [999_800_000 + PORT * 2, 999_800_001 + PORT * 2];
const HOME = `E2E Koti ${PORT}`;
const AWAY = `E2E Vieras ${PORT}`;
const DAY = 24 * 60 * 60 * 1000;

async function withDatabase(run: (sql: postgres.Sql) => Promise<unknown>) {
  const sql = postgres(testDatabaseUrl());
  try {
    await run(sql);
  } finally {
    await sql.end();
  }
}

test.describe("Arvauspeli, signed out", () => {
  test("asks the reader to sign in", async ({ page }) => {
    await page.goto("/arvauspeli");

    await expect(page.getByRole("heading", { name: "Arvauspeli", level: 1 })).toBeVisible();
    await expect(page.getByText("Kirjaudu sisään pelataksesi.")).toBeVisible();
  });

  test("is on the front page, and its English path leads to the Finnish one", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Arvauspeli/ })).toHaveAttribute(
      "href",
      "/arvauspeli"
    );

    await page.goto("/guessing-game");
    await expect(page).toHaveURL(/\/arvauspeli$/);
  });
});

test.describe("Arvauspeli, signed in", () => {
  let reader: Awaited<ReturnType<typeof storeSignedInReader>>;

  test.beforeAll(async () => {
    reader = await storeSignedInReader("user");
    await withDatabase(async (sql) => {
      await sql`delete from taso_matches where taso_match_id in ${sql(MATCH_IDS)}`;
      for (const [index, id] of MATCH_IDS.entries()) {
        await sql`insert into taso_matches ${sql({
          taso_match_id: id,
          competition_id: `spljp${SEASON % 100}`,
          category_id: "VL",
          season_id: SEASON,
          group_id: 1,
          group_name: "Runkosarja",
          kickoff_at: new Date(Date.now() + (10 + index) * DAY),
          matchday: 1,
          status: "SCHEDULED",
          home_team_provider_id: id,
          home_team_name: `${HOME}${index === 0 ? "" : " B"}`,
          away_team_provider_id: id + 1_000_000_000,
          away_team_name: `${AWAY}${index === 0 ? "" : " B"}`,
          home_goals: null,
          away_goals: null,
        })}`;
      }
    });
  });

  test.afterAll(async () => {
    await reader?.remove();
    await withDatabase(
      (sql) => sql`delete from taso_matches where taso_match_id in ${sql(MATCH_IDS)}`
    );
  });

  test("joins, guesses a 1X2, and changes it to a score, paying each from the balance", async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: SESSION_COOKIE, value: reader.cookie, url: baseURL as string }]);
    await page.goto("/arvauspeli");

    await page.getByRole("button", { name: "Liity peliin" }).click();
    const balance = page.getByText(/^Pelimerkit:/);
    await expect(balance).toHaveText(/^Pelimerkit: 1\s000$/);

    const row = page.getByRole("listitem").filter({ hasText: `${HOME} – ${AWAY}` });
    await expect(row.getByText(/^Hinta nyt 10, nousee 15:een /)).toBeVisible();
    await row.getByRole("radio", { name: "X" }).check();
    await row.getByRole("button", { name: "Arvaa" }).click();

    await expect(balance).toHaveText(/^Pelimerkit: 990$/);
    await expect(row.getByText("Arvauksesi: X")).toBeVisible();
    await expect(row.getByText(/^Muutos maksaa 10/)).toBeVisible();

    await row.getByRole("radio", { name: "Arvaa tulos" }).check();
    await row.getByLabel(`${HOME}, maalit`).fill("2");
    await row.getByLabel(`${AWAY}, maalit`).fill("1");
    await row.getByRole("button", { name: "Muuta arvausta" }).click();

    await expect(balance).toHaveText(/^Pelimerkit: 980$/);
    await expect(row.getByText("Arvauksesi: 2–1")).toBeVisible();
  });
});
