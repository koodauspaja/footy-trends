import { existsSync } from "node:fs";
import Redis from "ioredis";
import postgres from "postgres";
import { e2eAppPort, e2eRedisPort } from "../../scripts/e2e-target";
import { keptBetweenRuns, standInDatabaseUrl, standInRedis } from "../support/taso-stub";
import { ensureTestDatabase } from "../support/test-database";
import {
  CATEGORY_ID,
  COMPETITION_ID,
  MATCHES,
  SEASON,
  TEAM_ROWS,
  ZONE_ROWS,
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
 * decisions/063-competition-zones.md
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
      await tx`
        delete from taso_group_zones
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

      for (const row of ZONE_ROWS) {
        await tx`
          insert into taso_group_zones ${tx({
            category_id: CATEGORY_ID,
            competition_id: COMPETITION_ID,
            season_id: SEASON,
            group_id: row.group_id,
            level: row.level,
            team_count: row.team_count,
            label: row.label,
          })}
        `;
      }
    });
  } finally {
    await sql.end();
  }
}

/**
 * Starts a stand-in run with no TASO data of its own, so every TASO answer comes
 * from the recording: TASO's rows and predictions, and every cached value but
 * football-data's answers, go. Both stores belong to the run alone.
 *
 * decisions/674-e2e-on-an-empty-database.md
 */
async function clearStandInTaso(databaseUrl: string, redisUrl: string): Promise<void> {
  const sql = postgres(databaseUrl);
  try {
    await sql.begin(async (tx) => {
      await tx`truncate taso_matches, taso_group_teams, taso_group_zones`;
      await tx`delete from predictions where source = 'taso'`;
    });
  } finally {
    await sql.end();
  }
  const redis = new Redis(redisUrl);
  try {
    // Every key gathered first and deleted after, so no delete runs mid-scan.
    const cleared: string[] = [];
    for await (const keys of redis.scanStream({ count: 500 }) as AsyncIterable<string[]>) {
      cleared.push(...keys.filter((key) => !keptBetweenRuns(key)));
    }
    if (cleared.length > 0) await redis.del(...cleared);
  } finally {
    redis.disconnect();
  }
}

/**
 * Fails fast with a clear message when a provider API key is missing: this
 * suite runs against the real football-data.org and TASO APIs, not mocks. See
 * tests/e2e/README.md.
 *
 * decisions/009-veikkausliiga.md
 * decisions/304-test-database.md
 * decisions/672-e2e-without-the-provider.md
 * decisions/674-e2e-on-an-empty-database.md
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

  // Required with the stand-in on too: it changes where TASO requests go and
  // nothing else.
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
  if (process.env.E2E_TASO_STUB === "1") {
    // The database must be the stand-in's, derived as the config derives it,
    // before anything is seeded or cleared; Redis is derived here, not inherited.
    const appPort = e2eAppPort(process.env);
    if (url !== standInDatabaseUrl(url, appPort)) {
      throw new Error("A stand-in run must use its own database; the config did not set it.");
    }
    await clearStandInTaso(url, standInRedis(e2eRedisPort(process.env), appPort).url);
  }
  await seedFixtureSeason(url);
}
