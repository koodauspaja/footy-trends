import { randomBytes } from "node:crypto";
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
 * decisions/079-group-members-guesses.md
 */

const PORT = e2eAppPort(process.env);
const SEASON = 2199;
const MATCH_ID = 999_500_000 + PORT * 2;
const PLAYED_ID = 999_400_000 + PORT * 2;
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

  test("shows each member the other's guess on a played match, and nothing before kickoff", async ({
    browser,
    baseURL,
  }) => {
    const origin = baseURL as string;
    const [first, second] = await Promise.all([
      storeSignedInReader("user"),
      storeSignedInReader("user"),
    ]);
    const kickoff = new Date(Date.now() - 2 * DAY);
    let groupId = 0;
    try {
      await withDatabase(async (sql) => {
        await sql`delete from taso_matches where taso_match_id = ${PLAYED_ID}`;
        await sql`insert into taso_matches ${sql({
          taso_match_id: PLAYED_ID,
          competition_id: `spljp${SEASON % 100}`,
          category_id: "VL",
          season_id: SEASON,
          group_id: 1,
          group_name: "Runkosarja",
          kickoff_at: kickoff,
          matchday: 1,
          status: "FINISHED",
          home_team_provider_id: PLAYED_ID,
          home_team_name: `E2E Pelattu Koti ${PORT}`,
          away_team_provider_id: PLAYED_ID + 1_000_000_000,
          away_team_name: `E2E Pelattu Vieras ${PORT}`,
          home_goals: 2,
          away_goals: 1,
        })}`;
        await sql`insert into game_player ${sql([{ user_id: first.id }, { user_id: second.id }])}`;
        const settled = { settled_at: kickoff, result_home_goals: 2, result_away_goals: 1 };
        const [miss, exact] = await sql<{ id: number }[]>`insert into game_guess ${sql([
          {
            user_id: first.id,
            season_id: SEASON,
            taso_match_id: PLAYED_ID,
            kind: "outcome",
            outcome: "2",
            home_goals: null,
            away_goals: null,
            made_at: new Date(kickoff.getTime() - DAY),
            kickoff_at: kickoff,
            tier: "miss",
            ...settled,
          },
          {
            user_id: second.id,
            season_id: SEASON,
            taso_match_id: PLAYED_ID,
            kind: "score",
            outcome: null,
            home_goals: 2,
            away_goals: 1,
            made_at: new Date(kickoff.getTime() - DAY),
            kickoff_at: kickoff,
            tier: "exact",
            ...settled,
          },
        ])} returning id`;
        await sql`insert into game_ledger ${sql({
          user_id: second.id,
          season_id: SEASON,
          kind: "reward",
          amount: 100,
          guess_id: exact?.id ?? null,
        })}`;
        if (miss === undefined) throw new Error("no guess stored");
        // A guess on the match still to come, which nobody may see yet.
        await sql`insert into game_guess ${sql({
          user_id: first.id,
          season_id: SEASON,
          taso_match_id: MATCH_ID,
          kind: "outcome",
          outcome: "X",
          made_at: new Date(),
          kickoff_at: new Date(Date.now() + 10 * DAY),
        })}`;
        const [group] = await sql<{ id: number }[]>`insert into game_group ${sql({
          name: `E2E Arvaajat ${PORT}`,
          invite_token: randomBytes(32).toString("base64url"),
        })} returning id`;
        groupId = group?.id ?? 0;
        await sql`insert into game_group_member ${sql([
          { group_id: groupId, user_id: first.id, joined_at: new Date() },
          { group_id: groupId, user_id: second.id, joined_at: new Date() },
        ])}`;
      });

      for (const [reader, own, other] of [
        [first, "Nimetön pelaaja (sinä): 2Ei osunut", "Nimetön pelaaja: 2–1Oikea tulos +100"],
        [second, "Nimetön pelaaja: 2Ei osunut", "Nimetön pelaaja (sinä): 2–1Oikea tulos +100"],
      ] as const) {
        const page = await signedIn(browser, reader, origin);
        await page.goto(`/arvauspeli/ryhmat/${groupId}`);
        const section = page
          .getByRole("heading", { name: "Jäsenten arvaukset" })
          .locator("xpath=..");
        await expect(
          section.getByRole("heading", {
            level: 3,
            name: `E2E Pelattu Koti ${PORT} 2–1 E2E Pelattu Vieras ${PORT}`,
          })
        ).toBeVisible();
        await expect(section.getByText(/Arvasi 2\/2 jäsentä$/)).toBeVisible();
        await expect(section.getByRole("listitem")).toHaveText([own, other]);
        // Nothing of the match still to come.
        await expect(section.getByText(`E2E Ryhmä Koti ${PORT}`, { exact: false })).toHaveCount(0);
        await page.context().close();
      }
    } finally {
      await Promise.all([first.remove(), second.remove()]);
      await withDatabase((sql) => sql`delete from taso_matches where taso_match_id = ${PLAYED_ID}`);
    }
  });
});
