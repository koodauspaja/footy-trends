import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import Redis from "ioredis";
import postgres from "postgres";
import { EARLIEST_TASO_SEASON } from "../src/lib/taso";
import { CATEGORY_ID, COMPETITION_ID, SEASON } from "../tests/e2e/fixtures/veikkausliiga-2017";
import { testDatabaseUrl } from "../tests/support/test-database";
import {
  buildFixture,
  isRecorded,
  type Selection,
  type StoredGroupTeam,
  type StoredMatch,
  type StoredZone,
} from "./record-taso-fixture-plan";

/**
 * Records the domestic TASO answers the e2e suite's stand-in replays, from the
 * rows live runs stored in the test database and the category names cached in
 * Redis. Reads both, writes only `tests/e2e/fixtures/taso-domestic.json.gz`.
 *
 * decisions/674-e2e-on-an-empty-database.md
 */

const OUTPUT = "tests/e2e/fixtures/taso-domestic.json.gz";

async function main(): Promise<void> {
  process.loadEnvFile(".env");
  const selection: Selection = {
    earliestSeason: EARLIEST_TASO_SEASON,
    latestSeason: new Date().getFullYear(),
    seeded: { competitionId: COMPETITION_ID, categoryId: CATEGORY_ID, seasonId: SEASON },
  };

  const sql = postgres(testDatabaseUrl(), { transform: postgres.camel });
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    const matches = (
      await sql<StoredMatch[]>`
        select competition_id, category_id, season_id, taso_match_id, group_id, group_name,
          kickoff_at, matchday, status, winner, home_team_provider_id, home_team_name,
          away_team_provider_id, away_team_name, home_goals, away_goals, half_time_home,
          half_time_away
        from taso_matches`
    ).filter((row) => isRecorded(row, selection));
    const groupTeams = (
      await sql<StoredGroupTeam[]>`
        select competition_id, category_id, season_id, group_id, team_provider_id, team_name,
          starting_points, points, matches_played, matches_won, matches_tied, matches_lost,
          goals_for, goals_against, goals_diff, current_standing, final_group_standing
        from taso_group_teams`
    ).filter((row) => isRecorded(row, selection));
    const zones = (
      await sql<StoredZone[]>`
        select competition_id, category_id, season_id, group_id, level, team_count, label
        from taso_group_zones`
    ).filter((row) => isRecorded(row, selection));

    // The key `getSeasonCategoryName` caches TASO's answer under.
    const categoryNames: Record<string, Record<string, string>> = {};
    for (const competitionId of new Set(matches.map((row) => row.competitionId))) {
      const cached = await redis.get(`taso:categories:${competitionId}`);
      if (cached !== null) categoryNames[competitionId] = JSON.parse(cached);
    }

    const fixture = buildFixture({ matches, groupTeams, zones, categoryNames });
    writeFileSync(OUTPUT, gzipSync(JSON.stringify(fixture)));
    process.stdout.write(
      `${OUTPUT}: ${matches.length} matches, ${groupTeams.length} group rows, ` +
        `${zones.length} zones, names for ${Object.keys(categoryNames).length} competitions\n`
    );
  } finally {
    await sql.end();
    redis.disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
