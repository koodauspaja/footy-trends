import { type Browser, expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { e2eAppPort } from "../../scripts/e2e-target";
import { SESSION_COOKIE, storeSignedInReader } from "../support/e2e-session";
import { testDatabaseUrl } from "../support/test-database";

/**
 * Arvauspeli's private groups as two readers meet them: one creates a group,
 * the other opens its link, joins the game and the group in one press, sees
 * both on the group's page and leaves; a renewed link refuses the old one, and
 * a reader outside the group gets the 404. One match of its own keeps the
 * season open, ids carrying the run's port.
 *
 * decisions/078-private-groups.md
 */

const PORT = e2eAppPort(process.env);
const SEASON = 2199;
const MATCH_ID = 999_500_000 + PORT * 2;
const GROUP_NAME = `E2E Ryhmä ${PORT}`;
const DAY = 24 * 60 * 60 * 1000;

type Reader = Awaited<ReturnType<typeof storeSignedInReader>>;

async function withDatabase(run: (sql: postgres.Sql) => Promise<unknown>) {
  const sql = postgres(testDatabaseUrl());
  try {
    await run(sql);
  } finally {
    await sql.end();
  }
}

async function signedIn(browser: Browser, reader: Reader, baseURL: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([{ name: SESSION_COOKIE, value: reader.cookie, url: baseURL }]);
  return context.newPage();
}

test.describe("Arvauspeli's private groups", () => {
  let owner: Reader;
  let friend: Reader;
  let outsider: Reader;

  test.beforeAll(async () => {
    [owner, friend, outsider] = await Promise.all([
      storeSignedInReader("user"),
      storeSignedInReader("user"),
      storeSignedInReader("user"),
    ]);
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
        home_team_name: `E2E Ryhmä Koti ${PORT}`,
        away_team_provider_id: MATCH_ID + 1_000_000_000,
        away_team_name: `E2E Ryhmä Vieras ${PORT}`,
        home_goals: null,
        away_goals: null,
      })}`;
    });
  });

  test.afterAll(async () => {
    // The groups go with their last member, by the database's own trigger.
    await Promise.all([owner?.remove(), friend?.remove(), outsider?.remove()]);
    await withDatabase((sql) => sql`delete from taso_matches where taso_match_id = ${MATCH_ID}`);
  });

  test("is created, joined by its link, seen by both members, and left", async ({
    browser,
    baseURL,
    page,
  }) => {
    const origin = baseURL as string;
    const own = await signedIn(browser, owner, origin);
    await own.goto("/arvauspeli");
    await own.getByRole("button", { name: "Liity peliin" }).click();
    await expect(own.getByRole("heading", { name: "Ryhmät" })).toBeVisible();
    await expect(own.getByText(/Et kuulu vielä yhteenkään ryhmään/)).toBeVisible();

    await own.getByLabel("Ryhmän nimi").fill(`  ${GROUP_NAME} `);
    await own.getByRole("button", { name: "Perusta ryhmä" }).click();
    await expect(own.getByRole("heading", { level: 1, name: GROUP_NAME })).toBeVisible();
    await expect(own).toHaveURL(/\/arvauspeli\/ryhmat\/\d+$/);
    const groupUrl = own.url();
    const link = (await own.locator("code").textContent()) ?? "";
    expect(link).toMatch(/\/arvauspeli\/liity\/[\w-]{43}$/);

    // Signed out, the link names the group and asks the reader to sign in.
    await page.goto(link);
    await expect(
      page.getByText(`Kirjaudu sisään liittyäksesi ryhmään ${GROUP_NAME}.`)
    ).toBeVisible();

    const friendPage = await signedIn(browser, friend, origin);
    await friendPage.goto(link);
    await expect(
      friendPage.getByText(`Sinut on kutsuttu ryhmään ${GROUP_NAME} (1 jäsen).`)
    ).toBeVisible();
    await friendPage.getByRole("button", { name: "Liity peliin ja ryhmään" }).click();
    await expect(friendPage.getByRole("heading", { level: 1, name: GROUP_NAME })).toBeVisible();
    await expect(friendPage.getByText("2 jäsentä · omistaja Nimetön pelaaja")).toBeVisible();
    await expect(
      friendPage.getByText("2 jäsentä ei ole vielä arvannut tällä kaudella.")
    ).toBeVisible();
    // Joining by the link made the friend a player too.
    await friendPage.goto("/arvauspeli");
    await expect(friendPage.getByText(/^Pelimerkit:/)).toBeVisible();
    await expect(friendPage.getByRole("link", { name: GROUP_NAME })).toHaveAttribute(
      "href",
      new URL(groupUrl).pathname
    );

    // A reader outside the group gets the 404 for its page.
    const outside = await signedIn(browser, outsider, origin);
    await outside.goto(groupUrl);
    await expect(outside.getByRole("heading", { name: "Sivua ei löytynyt" })).toBeVisible();

    // The friend leaves, and the owner's page counts one member again.
    await friendPage.goto(groupUrl);
    await friendPage.getByRole("button", { name: "Poistu ryhmästä" }).click();
    await friendPage
      .getByRole("alertdialog")
      .getByRole("button", { name: "Poistu ryhmästä" })
      .click();
    await expect(friendPage).toHaveURL(/\/arvauspeli$/);
    await expect(friendPage.getByText(/Et kuulu vielä yhteenkään ryhmään/)).toBeVisible();
    await own.reload();
    await expect(own.getByText("1 jäsen · omistaja Nimetön pelaaja")).toBeVisible();
  });

  test("refuses the old link once the owner renews it", async ({ browser, baseURL }) => {
    const origin = baseURL as string;
    const own = await signedIn(browser, owner, origin);
    await own.goto("/arvauspeli");
    await own.getByRole("link", { name: GROUP_NAME }).click();
    const old = (await own.locator("code").textContent()) ?? "";

    await own.getByRole("button", { name: "Uusi linkki" }).click();
    await own.getByRole("alertdialog").getByRole("button", { name: "Uusi linkki" }).click();
    await expect(own.locator("code")).not.toHaveText(old);

    const outside = await signedIn(browser, outsider, origin);
    await outside.goto(old);
    await expect(
      outside.getByText("Kutsulinkki ei ole voimassa. Pyydä ryhmän jäseneltä uusi linkki.")
    ).toBeVisible();
    await expect(outside.getByText(GROUP_NAME)).toHaveCount(0);
  });
});
