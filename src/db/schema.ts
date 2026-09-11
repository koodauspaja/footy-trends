import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
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
    /**
     * Team search folds Finnish letters before matching, so the index has to
     * store the folded form — an index on the raw column cannot serve a query
     * on `translate(lower(...))`. See specs/027-team-search.md.
     *
     * `translate` rather than `unaccent`: the extension is not installed, and
     * `unaccent` is not `IMMUTABLE`, so it cannot be indexed at all.
     *
     * These serve exact and prefix matching. A leading-wildcard `LIKE '%x%'`
     * cannot use a B-tree, which is why 027 requires the substring query to be
     * measured at production scale before anyone trusts it.
     */
    index("matches_home_team_name_folded_idx").on(
      sql`translate(lower(${table.homeTeamName}), 'äöåÄÖÅ', 'aoaAOA')`
    ),
    index("matches_away_team_name_folded_idx").on(
      sql`translate(lower(${table.awayTeamName}), 'äöåÄÖÅ', 'aoaAOA')`
    ),
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
    /** The TASO half of the same search, from specs/027-team-search.md. */
    index("taso_matches_home_team_name_folded_idx").on(
      sql`translate(lower(${table.homeTeamName}), 'äöåÄÖÅ', 'aoaAOA')`
    ),
    index("taso_matches_away_team_name_folded_idx").on(
      sql`translate(lower(${table.awayTeamName}), 'äöåÄÖÅ', 'aoaAOA')`
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

/**
 * better-auth's four tables, from specs/023-google-oauth-login.md.
 *
 * Written by hand rather than by `@better-auth/cli generate`: the CLI is
 * published at 1.4.21 against the 1.7.3 library this repo pins, and a generated
 * file arrives without the comments every table above carries. The column list
 * is taken from `@better-auth/core/dist/db/get-tables.mjs` at 1.7.3.
 *
 * Two conventions differ from the tables above, both deliberately:
 *
 * 1. **Primary keys are `text`, not `serial`.** better-auth generates its own
 *    string ids; an integer key would need its `useNumberId` mode and a matching
 *    adapter config. The two id spaces never meet — no auth table references a
 *    match table or the reverse — so the inconsistency is contained.
 * 2. **Model names are singular.** `user`, `session`, `account` and
 *    `verification` are better-auth's defaults, and renaming them buys a naming
 *    convention at the cost of a mapping in every adapter call.
 *
 * The TS property names must stay camelCase whatever the SQL columns are called:
 * the Drizzle adapter resolves a field by indexing this table object with the
 * property key (`schemaModel[fieldName]`), and throws if it is absent. The SQL
 * column names are therefore free to stay snake_case like the rest of the file.
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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
    // Google's tokens. better-auth marks all three `returned: false`, so they
    // are never serialised to the client, and nothing in this app reads them —
    // the only scopes requested are `openid email profile`, which need no API
    // call after sign-in.
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
 * Required even though no email flow exists: better-auth stores the OAuth state
 * and PKCE verifier here for the duration of the Google redirect. Without this
 * table sign-in fails at the callback, not at startup.
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
 * A signed-in reader's preferences, from specs/024-account-settings.md.
 *
 * One row per user, created on first save rather than at sign-in: an untouched
 * settings page writes nothing, so a row's existence means someone chose
 * something.
 *
 * **Every column is nullable, and null is meaningful.** It means "no
 * preference", which is not the same as "prefers what the default happens to be
 * today". If the domestic fallback ever moves off Veikkausliiga, a reader who
 * never chose follows the change and a reader who explicitly chose Veikkausliiga
 * does not. It is also what makes every setting unsettable — nothing here is a
 * one-way door.
 *
 * Three competition columns rather than a `(user, region, code)` join table: the
 * three regions are fixed by the URL structure, and the code does not even have
 * one type spanning them — `CompetitionRegion` covers `foreign` and
 * `national-teams`, while Kotimaa's competitions come from TASO with their own
 * `DEFAULT_DOMESTIC_COMPETITION_CODE`. The column names say which registry each
 * value belongs to instead of pretending to a uniformity the data lacks.
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
 * Postgres `bytea`, which drizzle has no built-in column for.
 *
 * `Buffer` on the way in and out, which is what `sharp` produces and what the
 * route handler hands to a `Response`.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * One reader's own profile picture, from specs/025-custom-avatar.md.
 *
 * A separate table rather than a column on `user`: better-auth owns that table
 * and writes it from the Google profile on every sign-in, and image bytes have
 * no business in a row read on every session lookup.
 */
export const userAvatar = pgTable("user_avatar", {
  // The foreign key *is* the primary key. One avatar per reader, an upload
  // replaces rather than accumulates, and `on delete cascade` is what makes
  // account deletion complete without a second code path to forget.
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /**
   * The cache key in the image URL, and a random token rather than a
   * timestamp.
   *
   * `/api/avatar/me` is one URL for every reader, so the query parameter is the
   * only thing separating one reader's cached image from another's. A
   * millisecond timestamp collides across readers — two avatars saved in the
   * same millisecond produce byte-identical URLs — and the response is cached
   * `private, immutable` for a year, so a shared browser profile could serve
   * the previous account's picture to the next one. A random token cannot
   * collide, and unlike a timestamp it says nothing about when.
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
 * A reader's favourite teams, from specs/026-favourites.md.
 *
 * The identity is `(source, team_provider_id)` and **not** a competition:
 * specs/022 established that a team page spans competitions and seasons, so a
 * favourite follows the club rather than one of its league entries. The source
 * is half of it because the two providers' id spaces are independent — 317
 * already exists in both.
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
 * A reader's favourite competitions.
 *
 * A separate table rather than a `kind` column on the one above: a team is a
 * provider and a number, a competition is a region and a code, and one table
 * holding both would need four nullable columns plus a constraint saying which
 * pair is legal — a check where a type will do.
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
