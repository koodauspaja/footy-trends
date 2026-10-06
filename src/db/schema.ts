/**
 * Every table: the two providers' matches, TASO's group rows, better-auth's
 * four, and what the app stores for its readers and admins.
 *
 * decisions/001-premier-league-match-based-standings.md
 * decisions/009-veikkausliiga.md
 * decisions/023-google-oauth-login.md
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { TasoWinner } from "@/lib/taso";

/**
 * The columns `matches` and `tasoMatches` share. A function, because Drizzle's
 * column builders are stateful and cannot be reused across two tables.
 *
 * decisions/009-veikkausliiga.md
 * decisions/036-halftime-comebacks.md
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
    // Null for an unplayed match, and for a played one the provider reports no
    // half-time score for. Never 0, which is a score.
    halfTimeHome: integer("half_time_home"),
    halfTimeAway: integer("half_time_away"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  };
}

/**
 * football-data's matches, every competition and season in one table.
 *
 * decisions/001-premier-league-match-based-standings.md
 * decisions/004-listing-matches-for-selected-team.md
 * decisions/014-champions-league.md
 * decisions/019-match-page.md
 * decisions/020-context-free-team-page.md
 * decisions/027-team-search.md
 */
export const matches = pgTable(
  "matches",
  {
    id: serial("id").primaryKey(),
    providerMatchId: integer("provider_match_id").notNull(),
    competitionCode: text("competition_code").notNull(),
    seasonId: integer("season_id").notNull(),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    matchday: integer("matchday"),
    status: text("status").notNull().default("FINISHED"),
    // Cup competitions only; null for a league.
    stage: text("stage"),
    // "group" is reserved in SQL, hence the column name. Null outside a group
    // stage, including every match of a LEAGUE_STAGE season.
    groupName: text("group_name"),
    // The score breakdown behind a knockout tie. `home_goals` and `away_goals` are
    // the provider's `fullTime`, which includes a penalty shoot-out.
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
    // A pair of teams in either order: the planner scans this twice, so there is
    // no mirrored (away, home) index.
    index("matches_head_to_head_idx").on(table.homeTeamProviderId, table.awayTeamProviderId),
    // The away half of every match a team played; the index above serves the home
    // half. One column: the sort that follows reads from a bitmap.
    index("matches_away_team_idx").on(table.awayTeamProviderId),
    // Team search matches the folded name, so the index stores the folded form.
    // It serves exact and prefix matches only.
    index("matches_home_team_name_folded_idx").on(
      sql`translate(lower(${table.homeTeamName}), 'äöåÄÖÅ', 'aoaAOA')`
    ),
    index("matches_away_team_name_folded_idx").on(
      sql`translate(lower(${table.awayTeamName}), 'äöåÄÖÅ', 'aoaAOA')`
    ),
  ]
);

/**
 * TASO's matches, in a table of their own: TASO's match ids are a separate
 * numeric space from football-data's and would collide in one unique index.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
 * decisions/015-finnish-cups.md
 * decisions/027-team-search.md
 */
export const tasoMatches = pgTable(
  "taso_matches",
  {
    id: serial("id").primaryKey(),
    // Field names match `NormalizedTasoMatch`, so a selected row satisfies that
    // type with no mapping. The SQL column names stay TASO's.
    providerMatchId: integer("taso_match_id").notNull(),
    competitionCode: text("competition_id").notNull(),
    // Which competition inside the season umbrella: `competition_id` is shared by
    // every category and `group_id` collides across them.
    categoryId: text("category_id").notNull(),
    seasonId: integer("season_id").notNull(),
    groupId: integer("group_id").notNull(),
    groupName: text("group_name").notNull(),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    // TASO's own round_id, used directly as the round/matchday number — not
    // re-indexed per group. Null when TASO reports no round for the match.
    matchday: integer("matchday"),
    status: text("status").notNull(),
    // TASO's verdict on who went through, null until played: a cup tie level after
    // normal time goes to penalties it does not itemise.
    winner: text("winner").$type<TasoWinner>(),
    ...matchTeamColumns(),
  },
  (table) => [
    // Unique on the match id alone: TASO's ids are unique across categories.
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
    // orientations.
    index("taso_matches_head_to_head_idx").on(table.homeTeamProviderId, table.awayTeamProviderId),
    // As on `matches` above: the away half of a team's matches.
    index("taso_matches_away_team_idx").on(table.awayTeamProviderId),
    // The TASO half of the same search.
    index("taso_matches_home_team_name_folded_idx").on(
      sql`translate(lower(${table.homeTeamName}), 'äöåÄÖÅ', 'aoaAOA')`
    ),
    index("taso_matches_away_team_name_folded_idx").on(
      sql`translate(lower(${table.awayTeamName}), 'äöåÄÖÅ', 'aoaAOA')`
    ),
  ]
);

/**
 * TASO's per-team group rows, stored. Every stat column is nullable: a knockout
 * group has no points competition, and TASO omits the fields.
 *
 * decisions/013-more-finnish-competitions.md
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

/**
 * better-auth's `user` table, written by hand as its other three are. Its ids
 * are `text`, and the property names stay camelCase: the adapter resolves a
 * field by indexing this object.
 *
 * decisions/023-google-oauth-login.md
 * decisions/028-admin-tools-and-roles.md
 */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  // Required by better-auth. Google returns it under the `profile` scope; the
  // sign-in path falls back to the email's local part if it ever does not.
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // Always true in practice — Google is the only provider and it verifies
  // addresses itself — but the column is `required` in better-auth's model.
  emailVerified: boolean("email_verified").default(false).notNull(),
  // The Google avatar URL. Nullable, and nothing renders it yet.
  image: text("image"),
  /**
   * What this user may do. `text`, validated in TypeScript; defaulted and not
   * null, so a row better-auth inserts is a reader.
   */
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * better-auth's sessions, one row per signed-in device.
 *
 * decisions/023-google-oauth-login.md
 */
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    // What the session cookie carries. Unique because every session read is a
    // lookup by this value, and it is the whole basis of authentication.
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Recorded by better-auth on every session. Nullable: behind a proxy either
    // header can be absent, and neither is required to authenticate.
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Sign-out and account deletion both read every session a user owns.
    index("session_user_id_idx").on(table.userId),
  ]
);

/**
 * better-auth's link from a user to their Google account.
 *
 * decisions/023-google-oauth-login.md
 */
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    // The provider's own id for the account — Google's `sub`. Paired with
    // `providerId` this is what makes a repeat sign-in find the existing user
    // instead of creating a second one.
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Google's tokens. Never sent to the client, and nothing here reads them.
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    // Permanently unused: part of better-auth's core account model for the
    // email/password provider this app does not enable. Omitting a column the
    // library writes to would break on an adapter we do not control.
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    // The repeat-sign-in lookup above, and the guarantee that one Google
    // account cannot end up attached to two users.
    uniqueIndex("account_provider_account_idx").on(table.providerId, table.accountId),
  ]
);

/**
 * Required though no email flow exists: better-auth keeps the OAuth state and
 * PKCE verifier here for the duration of the Google redirect.
 *
 * decisions/023-google-oauth-login.md
 */
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A signed-in reader's preferences: one row per user, created on first save.
 * Every column is nullable, and null means no preference.
 *
 * decisions/024-account-settings.md
 */
export const userPreferences = pgTable("user_preferences", {
  id: text("id").primaryKey(),
  // Unique, not merely indexed: one row per reader is the whole shape of this
  // table, and a second row would make "the reader's preferences" ambiguous.
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  // "kotimaa" | "ulkomaat" | "maajoukkueet", or null for `Kysy joka kerta`.
  // Stored as the Finnish URL segment the reader is sent to, so the redirect is
  // a lookup rather than a translation.
  defaultRegion: text("default_region"),
  // Validated against the registries on read, never on write: a competition can
  // be retired from the registry long after someone chose it, and a stored code
  // that no longer resolves must fall back rather than strand the reader.
  defaultCompetitionDomestic: text("default_competition_domestic"),
  defaultCompetitionForeign: text("default_competition_foreign"),
  defaultCompetitionNational: text("default_competition_national"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Postgres `bytea`, which drizzle has no built-in column for. A `Buffer` both
 * ways.
 *
 * decisions/025-custom-avatar.md
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * One reader's own profile picture, in a table of its own: better-auth owns
 * `user` and rewrites it on every sign-in.
 *
 * decisions/025-custom-avatar.md
 */
export const userAvatar = pgTable("user_avatar", {
  // The foreign key *is* the primary key. One avatar per reader, an upload
  // replaces rather than accumulates, and `on delete cascade` is what makes
  // account deletion complete without a second code path to forget.
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /**
   * The cache key in the image URL: a random token, not a timestamp.
   */
  version: text("version").notNull(),
  // Always the output of our own re-encode, never the bytes that were uploaded.
  bytes: bytea("bytes").notNull(),
  // Stored rather than assumed: this column outlives whatever `sharp` is
  // configured to emit today, and the route handler must not guess.
  contentType: text("content_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Bookkeeping only. `version` is what the URL carries — see above.
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A reader's favourite teams. The identity is `(source, team_provider_id)`, not
 * a competition: a favourite follows the club.
 *
 * decisions/026-favourites.md
 */
export const favoriteTeam = pgTable(
  "favorite_team",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // "football-data" | "taso", validated on read the way a stored region is.
    source: text("source").notNull(),
    teamProviderId: integer("team_provider_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Favouriting twice is a no-op rather than a second row — two tabs and a
    // double click are the ordinary way it happens.
    uniqueIndex("favorite_team_identity_idx").on(table.userId, table.source, table.teamProviderId),
  ]
);

/**
 * A reader's favourite competitions, in a table of their own.
 *
 * decisions/026-favourites.md
 */
export const favoriteCompetition = pgTable(
  "favorite_competition",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // The Finnish URL segment, as `user_preferences.default_region` stores it.
    region: text("region").notNull(),
    competitionCode: text("competition_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("favorite_competition_identity_idx").on(
      table.userId,
      table.region,
      table.competitionCode
    ),
  ]
);

/**
 * One record per applied forced refresh: an operational log, not reader data.
 * The counts are the ones the confirmation dialog showed.
 *
 * decisions/029-forced-season-refresh.md
 */
export const refreshRuns = pgTable("refresh_runs", {
  id: serial("id").primaryKey(),
  /**
   * `"taso"` or `"football-data"`, validated in TypeScript.
   */
  source: text("source").notNull(),
  competitionCode: text("competition_code").notNull(),
  seasonId: integer("season_id").notNull(),
  /**
   * The season as the picker spells it, stored. Null when the run failed before
   * the season range could be resolved.
   */
  seasonLabel: text("season_label"),
  /** `"success"` or `"failed"`. */
  status: text("status").notNull(),
  /** The failure reason code, null on success. */
  reason: text("reason"),
  matchesInserted: integer("matches_inserted").notNull().default(0),
  matchesUpdated: integer("matches_updated").notNull().default(0),
  matchesDeleted: integer("matches_deleted").notNull().default(0),
  /** Null for football-data, which stores no group standings of its own. */
  groupRowsInserted: integer("group_rows_inserted"),
  groupRowsUpdated: integer("group_rows_updated"),
  groupRowsDeleted: integer("group_rows_deleted"),
  deductionsChanged: integer("deductions_changed").notNull().default(0),
  /**
   * `set null`, not `cascade`: the record survives the admin's account, the link
   * to the person does not.
   */
  runBy: text("run_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Every prediction a model made. The result is never copied in: it is read from
 * the match tables. One `live` and one `backtest` row per match per model.
 *
 * decisions/052-predictions-log.md
 */
export const predictions = pgTable(
  "predictions",
  {
    id: serial("id").primaryKey(),
    /** `"football-data"` or `"taso"`: the two id spaces never meet. */
    source: text("source").notNull(),
    providerMatchId: integer("provider_match_id").notNull(),
    /** The competition the match is filed under, so a reader needs no second lookup. */
    competitionCode: text("competition_code").notNull(),
    /** The model's name; a rule change is a new name. */
    model: text("model").notNull(),
    /** `"live"` or `"backtest"`. */
    kind: text("kind").notNull(),
    /** 0–1, unrounded. */
    homeProbability: doublePrecision("home_probability").notNull(),
    drawProbability: doublePrecision("draw_probability").notNull(),
    awayProbability: doublePrecision("away_probability").notNull(),
    predictedAt: timestamp("predicted_at", { withTimezone: true }).notNull(),
    /** The kickoff the prediction was made against; it follows a rescheduled match. */
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("predictions_identity_idx").on(
      table.source,
      table.providerMatchId,
      table.model,
      table.kind
    ),
  ]
);
