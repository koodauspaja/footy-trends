import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
    ...matchTeamColumns(),
  },
  (table) => [
    uniqueIndex("matches_provider_match_id_idx").on(table.providerMatchId),
    // Standings are always read for one competition and season at a time.
    index("matches_competition_season_idx").on(table.competitionCode, table.seasonId),
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
