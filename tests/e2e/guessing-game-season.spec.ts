import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { e2eAppPort } from "../../scripts/e2e-target";
import { SESSION_COOKIE, storeSignedInReader } from "../support/e2e-session";
import { testDatabaseUrl } from "../support/test-database";

/**
 * Arvauspeli's season guesses as a player sees them: placing a champion guess
 * before the season's first kickoff and changing it for free, and a settled
 * one after it. The season's fixtures, and the settled guess, are stored as
 * the refresh and the hourly run leave them.
 *
 * decisions/075-season-guesses.md
 */

const PORT = e2eAppPort(process.env);
// The season `guessing-game.spec.ts` plays in, with match ids and teams of its own.
const SEASON = 2199;
const FIRST_ID = 999_700_000 + PORT * 10;
const FIRST_TEAM = 999_700_000 + PORT * 20;
const DAY = 24 * 60 * 60 * 1000;
const COMPETITION = `spljp${SEASON % 100}`;
const teamName = (index: number) => `E2E Kausi ${PORT} ${String(index + 1).padStart(2, "0")}`;

async function withDatabase(run: (sql: postgres.Sql) => Promise<unknown>) {
  const sql = postgres(testDatabaseUrl());
  try {
    await run(sql);
  } finally {
    await sql.end();
  }
}

// The regular season's six fixtures, each of the twelve teams once.
function fixtures(firstKickoff: Date) {
  return [0, 1, 2, 3, 4, 5].map((index) => ({
    taso_match_id: FIRST_ID + index,
    competition_id: COMPETITION,
    category_id: "VL",
    season_id: SEASON,
    group_id: 1,
    group_name: "Runkosarja",
    kickoff_at: new Date(firstKickoff.getTime() + index * DAY),
    matchday: 1,
    status: "SCHEDULED",
    home_team_provider_id: FIRST_TEAM + 2 * index,
    home_team_name: teamName(2 * index),
    away_team_provider_id: FIRST_TEAM + 2 * index + 1,
    away_team_name: teamName(2 * index + 1),
    home_goals: null,
    away_goals: null,
  }));
}

const MATCH_IDS = [0, 1, 2, 3, 4, 5].map((index) => FIRST_ID + index);

test.describe("Arvauspeli season guesses", () => {
  let player: Awaited<ReturnType<typeof storeSignedInReader>>;

  async function signIn(page: import("@playwright/test").Page, baseURL: string | undefined) {
    await page
      .context()
      .addCookies([{ name: SESSION_COOKIE, value: player.cookie, url: baseURL as string }]);
    await page.goto("/arvauspeli");
  }

  test.afterEach(async () => {
    await player?.remove();
    await withDatabase(async (sql) => {
      await sql`delete from taso_matches where taso_match_id in ${sql(MATCH_IDS)}`;
    });
  });

  test("places a champion guess before the first kickoff, and changes it for free", async ({
    page,
    baseURL,
  }) => {
    player = await storeSignedInReader("user");
    await withDatabase(async (sql) => {
      await sql`delete from taso_matches where taso_match_id in ${sql(MATCH_IDS)}`;
      await sql`insert into taso_matches ${sql(fixtures(new Date(Date.now() + 10 * DAY)))}`;
      await sql`insert into game_player (user_id, joined_at) values (${player.id}, ${new Date(Date.now() - DAY)})`;
    });
    await signIn(page, baseURL);

    const champion = page
      .getByRole("listitem")
      .filter({ hasText: "Hinta 50 · oikein 200" })
      .first();
    await expect(page.getByText(/^Arvaa kausi ennen sen ensimmäistä ottelua/)).toBeVisible();
    await champion.getByRole("combobox").selectOption({ label: teamName(3) });
    await champion.getByRole("button", { name: "Arvaa mestari" }).click();
    await expect(champion.getByText(`Arvauksesi: ${teamName(3)}`)).toBeVisible();
    await expect(page.getByText(/^Pelimerkit:/)).toHaveText(/^Pelimerkit: 950$/);

    await champion.getByRole("combobox").selectOption({ label: teamName(7) });
    await champion.getByRole("button", { name: "Muuta mestaria" }).click();
    await expect(champion.getByText(`Arvauksesi: ${teamName(7)}`)).toBeVisible();
    await expect(page.getByText(/^Pelimerkit:/)).toHaveText(/^Pelimerkit: 950$/);
  });

  test("shows a settled champion guess after the lock, with no form", async ({ page, baseURL }) => {
    player = await storeSignedInReader("user");
    await withDatabase(async (sql) => {
      await sql`delete from taso_matches where taso_match_id in ${sql(MATCH_IDS)}`;
      // The first fixture has kicked off; the rest keep the season in play.
      await sql`insert into taso_matches ${sql(fixtures(new Date(Date.now() - DAY)))}`;
      await sql`insert into game_player (user_id, joined_at) values (${player.id}, ${new Date(Date.now() - 30 * DAY)})`;
      const [guess] = await sql<{ id: number }[]>`insert into game_season_guess ${sql({
        user_id: player.id,
        season_id: SEASON,
        kind: "champion",
        teams: [FIRST_TEAM + 3],
        made_at: new Date(Date.now() - 20 * DAY),
        lock_at: new Date(Date.now() - DAY),
        settled_at: new Date(Date.now() - DAY / 2),
        reward: 200,
        right_count: 1,
        near_count: 0,
      })} returning id`;
      await sql`insert into game_ledger ${sql([
        {
          user_id: player.id,
          season_id: SEASON,
          kind: "grant",
          amount: 1000,
          season_guess_id: null,
        },
        {
          user_id: player.id,
          season_id: SEASON,
          kind: "season-guess",
          amount: -50,
          season_guess_id: guess?.id,
        },
        {
          user_id: player.id,
          season_id: SEASON,
          kind: "season-reward",
          amount: 200,
          season_guess_id: guess?.id,
        },
      ])}`;
    });
    await signIn(page, baseURL);

    const champion = page.getByRole("listitem").filter({ hasText: "Mestari" }).first();
    await expect(champion.getByText(`Arvauksesi: ${teamName(3)}`)).toBeVisible();
    await expect(champion.getByText("Oikein, +200")).toBeVisible();
    await expect(page.getByRole("button", { name: "Arvaa mestari" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Muuta mestaria" })).toHaveCount(0);
    await expect(page.getByText(/^Pelimerkit:/)).toHaveText(/^Pelimerkit: 1\s150$/);
  });
});
