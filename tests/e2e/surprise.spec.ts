import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";
import { testDatabaseUrl } from "../support/test-database";

/**
 * `Kauden suurimmat yllätykset` and the match page's line, end to end, on the
 * seeded 2017 Veikkausliiga season. Signed in the way league-position.spec.ts
 * explains. Elo's backtest row is seeded on one of the season's own wins, and
 * a 2016 match beside it so that 2017 is not the competition's first stored
 * season; both are removed afterwards, and a row the match already had is put
 * back.
 *
 * decisions/057-surprise-index.md
 */

const STANDINGS = "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2017";
const HEADING = "Kauden suurimmat yllätykset";
const EARLIER_MATCH_ID = 999_057_001;

let matchId = 0;
// The match's Elo backtest row as it was before this suite, put back afterwards.
let before: postgres.Row[] = [];

async function withDatabase(run: (sql: postgres.Sql) => Promise<unknown>) {
  const sql = postgres(testDatabaseUrl());
  try {
    await run(sql);
  } finally {
    await sql.end();
  }
}

// The seeded season's first won match: the same one on every run.
async function wonMatch(sql: postgres.Sql) {
  const [won] = await sql<Array<{ id: number; kickoff_at: Date }>>`
    select taso_match_id as id, kickoff_at from taso_matches
    where category_id = 'VL' and competition_id = 'spljp17' and season_id = 2017
      and status = 'FINISHED' and home_goals <> away_goals
    order by kickoff_at, taso_match_id limit 1`;
  if (won === undefined) throw new Error("The seeded 2017 season has no won match");
  return won;
}

function eloRowOf(sql: postgres.Sql, id: number) {
  return sql`source = 'taso' and provider_match_id = ${id} and model = 'elo-v1' and kind = 'backtest'`;
}

test.beforeAll(async () => {
  await withDatabase(async (sql) => {
    const won = await wonMatch(sql);
    matchId = won.id;
    before = await sql`delete from predictions where ${eloRowOf(sql, matchId)} returning *`;
    await sql`delete from taso_matches where taso_match_id = ${EARLIER_MATCH_ID}`;

    await sql`insert into taso_matches ${sql({
      taso_match_id: EARLIER_MATCH_ID,
      competition_id: "spljp16",
      category_id: "VL",
      season_id: 2016,
      group_id: 1,
      group_name: "Runkosarja",
      kickoff_at: new Date("2016-05-01T15:00:00Z"),
      matchday: 1,
      status: "FINISHED",
      home_team_provider_id: 999_057_101,
      home_team_name: "E2E Koti",
      away_team_provider_id: 999_057_102,
      away_team_name: "E2E Vieras",
      home_goals: 1,
      away_goals: 0,
    })}`;
    // 6 % whichever side won.
    await sql`insert into predictions ${sql({
      source: "taso",
      provider_match_id: matchId,
      competition_code: "VL",
      model: "elo-v1",
      kind: "backtest",
      home_probability: 0.06,
      draw_probability: 0.88,
      away_probability: 0.06,
      predicted_at: won.kickoff_at,
      kickoff_at: won.kickoff_at,
    })}`;
  });
});

test.afterAll(async () => {
  await withDatabase(async (sql) => {
    await sql`delete from predictions where ${eloRowOf(sql, matchId)}`;
    await sql`delete from taso_matches where taso_match_id = ${EARLIER_MATCH_ID}`;
    for (const { id: _id, ...row } of before) await sql`insert into predictions ${sql(row)}`;
  });
});

test.describe("Surprises, signed in", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
  });

  test("the season's list comes first in Analyysit, and its match says the same", async ({
    page,
  }) => {
    await page.goto(STANDINGS);

    const analytics = page.getByRole("region", { name: "Analyysit" });
    await expect(analytics.getByRole("heading", { level: 3 }).first()).toHaveText("Tämä kausi");
    const panel = page
      .getByRole("region", { name: "Tämä kausi" })
      .getByRole("region", { name: HEADING });
    const item = panel.getByRole("listitem");
    await expect(item).toHaveCount(1);
    await expect(item).toHaveText(/^\d{2}\.\d{2}\.2017 · .+ – .+ \d+–\d+ · Elo antoi 6\s%$/);
    // A finished season carries no `(kesken)` line.
    await expect(panel.getByText(/\(kesken\)/)).toHaveCount(0);
    await expect(panel.getByText(/^Tasapelit eivät ole mukana/)).toBeVisible();

    await item.getByRole("link").click();

    await expect(page).toHaveURL(new RegExp(`/kotimaa/ottelu/${matchId}$`));
    await expect(page.getByText(/^Elo antoi tälle tulokselle 6\s%\.$/)).toBeVisible();
  });
});

test.describe("Surprises, signed out", () => {
  test("neither page carries a figure", async ({ page }) => {
    for (const path of [STANDINGS, `/kotimaa/ottelu/${matchId}`]) {
      const response = await page.goto(path);
      const html = (await response?.text()) ?? "";

      expect(html).toContain("<h1");
      expect(html).not.toContain(HEADING);
      expect(html).not.toContain("Elo antoi");
    }
  });
});
