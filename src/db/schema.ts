import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { TasoWinner } from "@/lib/taso";

/**
 * Columns identical between `matches` and `tasoMatches` — a function, not a
 * shared object literal, because Drizzle column builders are stateful and
 * can't be reused across two `pgTable` calls; each call here builds fresh
 * instances.
 */
function matchTeamColumns() {
  return {
    homeTeamProviderId: integer("home_team_provider_id").notNull(),
    homeTeamName: text("home_team_name").notNull(),
    awayTeamProviderId: integer("away_team_provider_id").notNull(),
    awayTeamName: text("away_team_name").notNull(),
    // Nullable: a not-yet-played match has no final score.
    homeGoals: integer("home_goals"),
    awayGoals: integer("away_goals"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  };
}

export const matches = pgTable(
  "matches",
  {
    id: serial("id").primaryKey(),
    providerMatchId: integer("provider_match_id").notNull(),
    competitionCode: text("competition_code").notNull(),
    seasonId: integer("season_id").notNull(),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    matchday: integer("matchday"),
    // Only ever "FINISHED" until 004-listing-matches-for-selected-team, whose
    // migration backfills the default below so existing rows stay accurate.
    status: text("status").notNull().default("FINISHED"),
    // Cup competitions only, added in specs/014-champions-league.md. Null for
    // all nine league competitions, so the migration needs no backfill.
    stage: text("stage"),
    // "group" is reserved in SQL, hence the column name. Null outside a group
    // stage, including every match of a LEAGUE_STAGE season.
    groupName: text("group_name"),
    // The score breakdown behind a knockout tie. `home_goals`/`away_goals`
    // stay the provider's `fullTime`, which INCLUDES a penalty shootout and is
    // therefore useless for aggregating a two-legged tie — see
    // `ProviderMatch` in src/lib/football-data.ts.
    regularTimeHome: integer("regular_time_home"),
    regularTimeAway: integer("regular_time_away"),
    extraTimeHome: integer("extra_time_home"),
    extraTimeAway: integer("extra_time_away"),
    penaltiesHome: integer("penalties_home"),
    penaltiesAway: integer("penalties_away"),
    ...matchTeamColumns(),
  },
  (table) => [
    uniqueIndex("matches_provider_match_id_idx").on(table.providerMatchId),
    // Standings are always read for one competition and season at a time.
    index("matches_competition_season_idx").on(table.competitionCode, table.seasonId),
    // Every cup read is scoped to one competition, season and stage.
    index("matches_competition_season_stage_idx").on(
      table.competitionCode,
      table.seasonId,
      table.stage
    ),
    // The match page's head-to-head list, which asks for one pair of teams in
    // either order. One composite index serves both orientations: the planner
    // scans it twice under a BitmapOr, so the mirrored (away, home) index earns
    // nothing and is deliberately absent. See specs/019-match-page.md.
    index("matches_head_to_head_idx").on(table.homeTeamProviderId, table.awayTeamProviderId),
    // The away half of "every match this team played, either side". The index
    // above already serves the home half; without this one the away half scans
    // that index's whole second column. Single-column deliberately: the sort
    // that follows reads from a bitmap, which has already discarded index
    // order, so carrying `kickoff_at` here buys nothing. See
    // specs/020-context-free-team-page.md.
    index("matches_away_team_idx").on(table.awayTeamProviderId),
  ]
);

// Own table, own uniqueness on tasoMatchId: TASO's match IDs are a separate
// numeric space from football-data.org's and could otherwise collide if
// sharing `matches`' provider_match_id unique index. See
// specs/009-veikkausliiga.md.
export const tasoMatches = pgTable(
  "taso_matches",
  {
    id: serial("id").primaryKey(),
    // TS field names match `NormalizedTasoMatch` (taso.ts) verbatim — same
    // reason `matches` above mirrors `NormalizedProviderMatch` — so a
    // selected row satisfies that type structurally, with no mapping step.
    // The underlying SQL column names stay TASO-specific.
    providerMatchId: integer("taso_match_id").notNull(),
    competitionCode: text("competition_id").notNull(),
    // Which competition inside the season umbrella. `competition_id` is
    // shared by every category and `group_id` collides across them
    // (Veikkausliiga, Kakkonen and Ykkönen each have a group 1 in spljp26),
    // so this is what actually separates one competition's matches from
    // another's. See specs/013-more-finnish-competitions.md.
    categoryId: text("category_id").notNull(),
    seasonId: integer("season_id").notNull(),
    groupId: integer("group_id").notNull(),
    groupName: text("group_name").notNull(),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    // TASO's own round_id, used directly as the round/matchday number — not
    // re-indexed per group. Null when TASO reports no round for the match.
    matchday: integer("matchday"),
    status: text("status").notNull(),
    // TASO's own verdict on who went through: "home" | "away" | "tie", null
    // until played. A cup tie level after normal time is decided on penalties
    // TASO does not itemise, so the score cannot answer this and the bracket
    // has nothing else to go on. See specs/015-finnish-cups.md.
    // Typed as the union rather than plain text, so a selected row keeps
    // satisfying `NormalizedTasoMatch` structurally — the same reason every
    // other column here mirrors that type's field names.
    winner: text("winner").$type<TasoWinner>(),
    ...matchTeamColumns(),
  },
  (table) => [
    // Still keyed on the match id alone: TASO's `match_id` is unique across
    // categories, confirmed live (710 ids across six categories in spljp26,
    // zero collisions), so `category_id` is a filter and index column rather
    // than part of uniqueness.
    uniqueIndex("taso_matches_taso_match_id_idx").on(table.providerMatchId),
    // Standings/match-list reads are always scoped to one category,
    // competition, season, and group at a time.
    index("taso_matches_category_competition_season_group_idx").on(
      table.categoryId,
      table.competitionCode,
      table.seasonId,
      table.groupId
    ),
    // As on `matches` above: the head-to-head pair lookup, one index for both
    // orientations. Measured on 20,604 stored rows, this turns the query from a
    // 3.16 ms sequential scan into a 0.13 ms bitmap scan.
    index("taso_matches_head_to_head_idx").on(table.homeTeamProviderId, table.awayTeamProviderId),
    // As on `matches` above. Measured on 20,604 stored rows: 1.03 ms and 144
    // buffers without it, 0.20 ms and 94 with.
    index("taso_matches_away_team_idx").on(table.awayTeamProviderId),
  ]
);

/**
 * `getGroups`' per-team rows, stored rather than only Redis-cached.
 *
 * Own-calculated standings depend on `starting_points` — TASO's carrier for
 * points deductions and junior qualifying bonuses — so a cold cache or a TASO
 * outage must not silently change a table's points. This also serves the
 * numbers a group falls back to when our calculation disagrees with TASO's.
 * See specs/013-more-finnish-competitions.md.
 *
 * Every stat column is nullable: a knockout group has no points competition at
 * all and TASO omits the fields entirely rather than sending zeroes.
 */
export const tasoGroupTeams = pgTable(
  "taso_group_teams",
  {
    id: serial("id").primaryKey(),
    categoryId: text("category_id").notNull(),
    competitionCode: text("competition_id").notNull(),
    seasonId: integer("season_id").notNull(),
    groupId: integer("group_id").notNull(),
    teamProviderId: integer("team_provider_id").notNull(),
    teamName: text("team_name").notNull(),
    // The whole reason this table exists. Negative is a deduction; a large
    // positive under a seeded carry-over entry is the parent's points.
    startingPoints: integer("starting_points"),
    points: integer("points"),
    played: integer("matches_played"),
    won: integer("matches_won"),
    drawn: integer("matches_tied"),
    lost: integer("matches_lost"),
    goalsFor: integer("goals_for"),
    goalsAgainst: integer("goals_against"),
    goalDifference: integer("goals_diff"),
    currentStanding: integer("current_standing"),
    finalGroupStanding: integer("final_group_standing"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // A team appears once per group. Unlike `taso_matches`, there is no
    // provider-side id to key on — the group and the team together are the
    // identity.
    uniqueIndex("taso_group_teams_identity_idx").on(
      table.categoryId,
      table.competitionCode,
      table.seasonId,
      table.groupId,
      table.teamProviderId
    ),
  ]
);
