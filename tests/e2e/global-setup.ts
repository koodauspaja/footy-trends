import { existsSync } from "node:fs";
import postgres from "postgres";
import { ensureTestDatabase } from "../support/test-database";
import {
  CATEGORY_ID,
  COMPETITION_ID,
  MATCHES,
  SEASON,
  TEAM_ROWS,
} from "./fixtures/veikkausliiga-2017";

/**
 * Fails fast with a clear message when a provider API key is missing,
 * instead of letting every test time out waiting on pages that silently
 * render the generic error state. This suite runs against the real
 * football-data.org and TASO APIs, not mocks — see tests/e2e/README.md.
 */
/**
 * Writes the seeded season from #304, replacing whatever is there for it.
 *
 * Deleting first is the point: a developer's database may already hold rows for
 * this season from an earlier run or an accidental sync, and a test that renders
 * *those* is back to depending on local contents. After this the season is
 * exactly the fixture, on any database.
 *
 * Uses `postgres` directly rather than the app's `db`, so the setup pulls in no
 * application module and cannot be affected by one.
 */
async function seedFixtureSeason(url: string): Promise<void> {
  const sql = postgres(url);
  try {
    /**
     * One transaction, so the season is never half-written.
     *
     * `taso_match_id` is globally unique, so two runs interleaving the delete
     * and the inserts would collide on it — one seeing rows the other had just
     * written, or deleting rows it was about to need. Two concurrent e2e runs
     * already fight over port 3001 and one of them dies there, but atomicity
     * costs nothing and does not depend on that staying true.
     */
    await sql.begin(async (tx) => {
      await tx`
        delete from taso_matches
        where season_id = ${SEASON} and category_id = ${CATEGORY_ID}
      `;
      await tx`
        delete from taso_group_teams
        where season_id = ${SEASON} and category_id = ${CATEGORY_ID}
      `;

      for (const row of MATCHES) {
        await tx`
          insert into taso_matches ${tx({
            taso_match_id: row.taso_match_id,
            competition_id: COMPETITION_ID,
            category_id: CATEGORY_ID,
            season_id: SEASON,
            group_id: row.group_id,
            group_name: row.group_name,
            kickoff_at: row.kickoff_at,
            matchday: row.matchday,
            status: "FINISHED",
            home_team_provider_id: row.home.id,
            home_team_name: row.home.name,
            away_team_provider_id: row.away.id,
            away_team_name: row.away.name,
            home_goals: row.home_goals,
            away_goals: row.away_goals,
          })}
        `;
      }

      for (const row of TEAM_ROWS) {
        await tx`
          insert into taso_group_teams ${tx({
            category_id: CATEGORY_ID,
            competition_id: COMPETITION_ID,
            season_id: SEASON,
            group_id: row.group_id,
            team_provider_id: row.team.id,
            team_name: row.team.name,
            points: row.points,
            matches_played: row.matches_played,
            current_standing: row.current_standing,
          })}
        `;
      }
    });
  } finally {
    await sql.end();
  }
}

export default async function globalSetup() {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  if (!process.env.FOOTBALL_DATA_API_KEY) {
    throw new Error(
      "FOOTBALL_DATA_API_KEY is not set. tests/e2e runs against the real " +
        "football-data.org API — set it in .env before running npm run test:e2e " +
        "(see README.md's Quick Start)."
    );
  }

  if (!process.env.TASO_API_KEY) {
    throw new Error(
      "TASO_API_KEY is not set. tests/e2e runs against the real TASO API " +
        "(Veikkausliiga) — set it in .env before running npm run test:e2e " +
        "(see docs/setup/020-taso-api-key.md)."
    );
  }

  // Creates and migrates the suite's own database if it is not there, then
  // seeds it. The application server is pointed at the same URL by
  // `playwright.config.ts`.
  const url = await ensureTestDatabase();
  await seedFixtureSeason(url);
}
