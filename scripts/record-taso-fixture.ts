import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import Redis from "ioredis";
import postgres from "postgres";
import { EARLIEST_TASO_SEASON } from "../src/lib/taso";
import { CATEGORY_ID, COMPETITION_ID, SEASON } from "../tests/e2e/fixtures/veikkausliiga-2017";
import { testDatabaseUrl } from "../tests/support/test-database";
import {
  buildFixture,
  isProviderMatch,
  isRecorded,
  parseCategoryNames,
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
  if (existsSync(".env")) process.loadEnvFile(".env");
  const selection: Selection = {
    earliestSeason: EARLIEST_TASO_SEASON,
    latestSeason: new Date().getFullYear(),
    seeded: { competitionId: COMPETITION_ID, categoryId: CATEGORY_ID, seasonId: SEASON },
  };

  const sql = postgres(testDatabaseUrl(), { transform: postgres.camel });
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    // One snapshot, so a refresh landing between the reads cannot mix two
    // versions of a season.
    const [matchRows, groupTeamRows, zoneRows] = await sql.begin(
      "read only isolation level repeatable read",
      async (tx) => [
        await tx<StoredMatch[]>`
          select competition_id, category_id, season_id, taso_match_id, group_id, group_name,
            kickoff_at, matchday, status, winner, home_team_provider_id, home_team_name,
            away_team_provider_id, away_team_name, home_goals, away_goals, half_time_home,
            half_time_away
          from taso_matches`,
        await tx<StoredGroupTeam[]>`
          select competition_id, category_id, season_id, group_id, team_provider_id, team_name,
            starting_points, points, matches_played, matches_won, matches_tied, matches_lost,
            goals_for, goals_against, goals_diff, current_standing, final_group_standing
          from taso_group_teams
          order by id`,
        await tx<StoredZone[]>`
          select competition_id, category_id, season_id, group_id, level, team_count, label
          from taso_group_zones`,
      ]
    );
    const matches = matchRows.filter((row) => isRecorded(row, selection) && isProviderMatch(row));
    const groupTeams = groupTeamRows.filter((row) => isRecorded(row, selection));
    const zones = zoneRows.filter((row) => isRecorded(row, selection));

    // The key `getSeasonCategoryName` caches TASO's answer under.
    const competitionIds = [
      ...new Set([...matches, ...groupTeams, ...zones].map((row) => row.competitionId)),
    ];
    const keys = competitionIds.map((id) => `taso:categories:${id}`);
    // MGET refuses no keys; with no rows, `buildFixture` refuses the recording.
    const cached = keys.length === 0 ? [] : await redis.mget(keys);
    const categoryNames = Object.fromEntries(
      competitionIds.flatMap((id, index) => {
        const raw = cached[index];
        if (raw === null || raw === undefined) return [];
        return [[id, parseCategoryNames(`taso:categories:${id}`, raw)]];
      })
    );

    const fixture = buildFixture({ matches, groupTeams, zones, categoryNames });
    // Written beside the fixture, under this process's own name, and renamed
    // over it: an interrupted run leaves the old file whole, and two runs at
    // once never write the same file.
    const partial = `${OUTPUT}.${process.pid}.partial`;
    try {
      writeFileSync(partial, gzipSync(JSON.stringify(fixture)));
      renameSync(partial, OUTPUT);
    } catch (error) {
      rmSync(partial, { force: true });
      throw error;
    }
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
