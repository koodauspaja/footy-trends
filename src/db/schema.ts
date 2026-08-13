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
