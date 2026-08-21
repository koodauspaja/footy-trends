import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
    homeTeamProviderId: integer("home_team_provider_id").notNull(),
    homeTeamName: text("home_team_name").notNull(),
    awayTeamProviderId: integer("away_team_provider_id").notNull(),
    awayTeamName: text("away_team_name").notNull(),
    // Nullable: a not-yet-played match has no final score.
    homeGoals: integer("home_goals"),
    awayGoals: integer("away_goals"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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
    seasonId: integer("season_id").notNull(),
    groupId: integer("group_id").notNull(),
    groupName: text("group_name").notNull(),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    // TASO's own round_id, used directly as the round/matchday number — not
    // re-indexed per group. Null when TASO reports no round for the match.
    matchday: integer("matchday"),
    status: text("status").notNull(),
    homeTeamProviderId: integer("home_team_provider_id").notNull(),
    homeTeamName: text("home_team_name").notNull(),
    awayTeamProviderId: integer("away_team_provider_id").notNull(),
    awayTeamName: text("away_team_name").notNull(),
    homeGoals: integer("home_goals"),
    awayGoals: integer("away_goals"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("taso_matches_taso_match_id_idx").on(table.providerMatchId),
    // Standings/match-list reads are always scoped to one competition, season,
    // and group at a time.
    index("taso_matches_competition_season_group_idx").on(
      table.competitionCode,
      table.seasonId,
      table.groupId
    ),
  ]
);
