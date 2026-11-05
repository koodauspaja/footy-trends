import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { e2eAppPort } from "../../scripts/e2e-target";
import { SESSION_COOKIE, storeSignedInReader } from "../support/e2e-session";
import { testDatabaseUrl } from "../support/test-database";
import { openFolds } from "./folds";

/**
 * Arvauspeli against the models as a player sees it: a settled guess with the
 * four models' guesses and what beating them paid. The settled guess, its
 * ledger and the models' live rows are stored as the hourly run leaves them.
 *
 * decisions/074-against-the-models.md
 */

const PORT = e2eAppPort(process.env);
// The season `guessing-game.spec.ts` plays in, with match ids and teams of its own.
const SEASON = 2199;
const PLAYED_ID = 999_600_000 + PORT * 2;
const UPCOMING_ID = PLAYED_ID + 1;
const HOME = `E2E Malli Koti ${PORT}`;
const AWAY = `E2E Malli Vieras ${PORT}`;
const DAY = 24 * 60 * 60 * 1000;
const COMPETITION = `spljp${SEASON % 100}`;

async function withDatabase(run: (sql: postgres.Sql) => Promise<unknown>) {
  const sql = postgres(testDatabaseUrl());
  try {
    await run(sql);
  } finally {
    await sql.end();
  }
}

function match(id: number, kickoff: Date, played: boolean) {
  return {
    taso_match_id: id,
    competition_id: COMPETITION,
    category_id: "VL",
    season_id: SEASON,
    group_id: 1,
    group_name: "Runkosarja",
    kickoff_at: kickoff,
    matchday: 1,
    status: played ? "FINISHED" : "SCHEDULED",
    home_team_provider_id: id,
    home_team_name: HOME,
    away_team_provider_id: id + 1_000_000_000,
    away_team_name: AWAY,
    home_goals: played ? 0 : null,
    away_goals: played ? 2 : null,
  };
}

function live(
  model: string,
  home: number,
  draw: number,
  away: number,
  score: [number, number] | null
) {
  return {
    source: "taso",
    provider_match_id: PLAYED_ID,
    competition_code: COMPETITION,
    model,
    kind: "live",
    home_probability: home,
    draw_probability: draw,
    away_probability: away,
    predicted_at: new Date(Date.now() - 3 * DAY),
    kickoff_at: new Date(Date.now() - 2 * DAY),
    predicted_home_goals: score?.[0] ?? null,
    predicted_away_goals: score?.[1] ?? null,
  };
}

test.describe("Arvauspeli against the models", () => {
  let player: Awaited<ReturnType<typeof storeSignedInReader>>;

  test.beforeAll(async () => {
    player = await storeSignedInReader("user");
    const kickoff = new Date(Date.now() - 2 * DAY);
    await withDatabase(async (sql) => {
      await sql`delete from taso_matches where taso_match_id in ${sql([PLAYED_ID, UPCOMING_ID])}`;
      await sql`delete from predictions where provider_match_id = ${PLAYED_ID}`;
      // A match still to come keeps the season open, so the settled one is listed.
      await sql`insert into taso_matches ${sql([
        match(PLAYED_ID, kickoff, true),
        match(UPCOMING_ID, new Date(Date.now() + 10 * DAY), false),
      ])}`;
      await sql`insert into predictions ${sql([
        live("elo-v1", 0.5, 0.3, 0.2, null),
        live("elo-form-v1", 0.3, 0.4, 0.3, null),
        live("elo-home-v1", 0.2, 0.3, 0.5, null),
        live("poisson-v1", 0.5, 0.3, 0.2, [2, 1]),
      ])}`;
      await sql`insert into game_player (user_id, joined_at) values (${player.id}, ${new Date(Date.now() - 30 * DAY)})`;
      const [guess] = await sql<{ id: number }[]>`insert into game_guess ${sql({
        user_id: player.id,
        season_id: SEASON,
        taso_match_id: PLAYED_ID,
        kind: "outcome",
        outcome: "2",
        free: false,
        made_at: new Date(Date.now() - 9 * DAY),
        kickoff_at: kickoff,
        settled_at: new Date(Date.now() - DAY),
        tier: "outcome",
        result_home_goals: 0,
        result_away_goals: 2,
      })} returning id`;
      await sql`insert into game_ledger ${sql([
        { user_id: player.id, season_id: SEASON, kind: "grant", amount: 1000, guess_id: null },
        { user_id: player.id, season_id: SEASON, kind: "guess", amount: -10, guess_id: guess?.id },
        { user_id: player.id, season_id: SEASON, kind: "reward", amount: 30, guess_id: guess?.id },
        { user_id: player.id, season_id: SEASON, kind: "models", amount: 30, guess_id: guess?.id },
      ])}`;
    });
  });

  test.afterAll(async () => {
    await player?.remove();
    await withDatabase(async (sql) => {
      await sql`delete from predictions where provider_match_id = ${PLAYED_ID}`;
      await sql`delete from taso_matches where taso_match_id in ${sql([PLAYED_ID, UPCOMING_ID])}`;
    });
  });

  test("shows a settled guess with the models' guesses and what beating them paid", async ({
    page,
    baseURL,
  }) => {
    await page
      .context()
      .addCookies([{ name: SESSION_COOKIE, value: player.cookie, url: baseURL as string }]);
    await page.goto("/arvauspeli");

    await openFolds(page, "Ratkaistut");
    const settled = page.getByRole("listitem").filter({ hasText: `${HOME} 0–2 ${AWAY}` });
    await expect(settled.getByText("Oikea merkki +30")).toBeVisible();
    await expect(settled.getByText("Voitit mallit +30")).toBeVisible();
    await expect(
      settled.getByText("Mallit: Elo 1 · Elo + vire X · Elo + kotietu 2 · Poisson 2–1")
    ).toBeVisible();
    await expect(page.getByText(/^Pelimerkit:/)).toHaveText(/^Pelimerkit: 1\s050$/);
  });
});
