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
 * Names this fixture's seeding, so two of them serialise and nothing else does.
 *
 * decisions/304-test-database.md
 */
const FIXTURE_LOCK_KEY = 3_040_026;

/**
 * Writes the seeded season, replacing whatever is there for it: a developer's
 * database may hold rows for it from an earlier run or an accidental sync. Uses
 * `postgres` directly, so the setup pulls in no application module.
 *
 * decisions/304-test-database.md
 * decisions/036-halftime-comebacks.md
 */
async function seedFixtureSeason(url: string): Promise<void> {
  const sql = postgres(url);
  try {
    // One transaction, holding a lock: `taso_match_id` is globally unique, and two
    // transactions that both delete and then both insert collide. The advisory lock
    // makes them take turns, and is released with the transaction.
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${FIXTURE_LOCK_KEY})`;
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
            half_time_home: row.half_time_home,
            half_time_away: row.half_time_away,
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

/**
 * Fails fast with a clear message when a provider API key is missing: this
 * suite runs against the real football-data.org and TASO APIs, not mocks. See
 * tests/e2e/README.md.
 *
 * decisions/009-veikkausliiga.md
 * decisions/304-test-database.md
 */
export default async function globalSetup() {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  if (!process.env.FOOTBALL_DATA_API_KEY) {
    throw new Error(
      "FOOTBALL_DATA_API_KEY is not set. tests/e2e runs against the real " +
        "football-data.org API — set it in .env before running npm run test:e2e " +
        "(see INSTALL.md)."
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
