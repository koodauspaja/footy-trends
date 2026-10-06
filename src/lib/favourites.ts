import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { favoriteCompetition, favoriteTeam, matches, tasoMatches, user } from "@/db/schema";
import { regionOfCompetition } from "@/lib/competitions";
import {
  competitionKey,
  type FavouriteSource,
  MAX_FAVOURITES_PER_KIND,
  teamKey,
} from "@/lib/favourite-keys";
import { logger } from "@/lib/logger";
import { FINLAND_TEAM_NAME, MENS_TEAM, WOMENS_TEAM } from "@/lib/national-team";
import type { RegionSegment } from "@/lib/regions";

/**
 * Reading and writing one reader's favourites, in two tables because a team and
 * a competition are identified differently.
 *
 * decisions/026-favourites.md
 */

/**
 * The transaction handle drizzle hands `db.transaction`.
 *
 * decisions/026-favourites.md
 */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type Favourites = { teams: string[]; competitions: string[] };

export const NO_FAVOURITES: Favourites = { teams: [], competitions: [] };

/**
 * The favourite's state after the write, or why there was none: "is it one
 * now", so an insert that lost a race to an identical one is still `true`.
 *
 * decisions/026-favourites.md
 */
export type FavouriteWrite = { ok: true; favorite: boolean } | { ok: false; reason: "limit" };

/**
 * Both lists as keys for the session payload: the client only asks whether one is there.
 *
 * decisions/026-favourites.md
 */
export async function getFavouriteKeys(userId: string): Promise<Favourites> {
  const [teams, competitions] = await Promise.all([
    db
      .select({ source: favoriteTeam.source, teamProviderId: favoriteTeam.teamProviderId })
      .from(favoriteTeam)
      .where(eq(favoriteTeam.userId, userId))
      .limit(MAX_FAVOURITES_PER_KIND),
    db
      .select({
        region: favoriteCompetition.region,
        competitionCode: favoriteCompetition.competitionCode,
      })
      .from(favoriteCompetition)
      .where(eq(favoriteCompetition.userId, userId))
      .limit(MAX_FAVOURITES_PER_KIND),
  ]);

  return {
    // Cast at the edge: an unknown source makes a key nothing matches, which
    // renders as "not a favourite" rather than an error.
    teams: teams.map((row) => teamKey(row.source as FavouriteSource, row.teamProviderId)),
    competitions: competitions.map((row) =>
      competitionKey(row.region as RegionSegment, row.competitionCode)
    ),
  };
}

/**
 * Runs a toggle with this reader's `user` row locked, so two tabs at the cap
 * cannot both count 49 and insert. It waits only for the same reader's writes.
 *
 * decisions/026-favourites.md
 */
async function withUserLocked<T>(userId: string, run: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select 1 from ${user} where ${user.id} = ${userId} for update`);
    return run(tx);
  });
}

async function countFor(
  tx: Transaction,
  table: typeof favoriteTeam | typeof favoriteCompetition,
  userId: string
): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(eq(table.userId, userId));
  return row?.n ?? 0;
}

/**
 * Adds the team if it is missing, removes it if it is there. Two concurrent
 * toggles flip it twice, and each caller is told what its own write did.
 *
 * decisions/026-favourites.md
 */
export async function toggleFavouriteTeam(
  userId: string,
  source: FavouriteSource,
  teamProviderId: number
): Promise<FavouriteWrite> {
  const where = and(
    eq(favoriteTeam.userId, userId),
    eq(favoriteTeam.source, source),
    eq(favoriteTeam.teamProviderId, teamProviderId)
  );

  return withUserLocked(userId, async (tx) => {
    const removed = await tx.delete(favoriteTeam).where(where).returning({ id: favoriteTeam.id });
    if (removed.length > 0) return { ok: true, favorite: false };

    // Counted after the delete, so unfavouriting at the cap always works — a
    // reader who cannot remove one because they have too many would be stuck.
    if ((await countFor(tx, favoriteTeam, userId)) >= MAX_FAVOURITES_PER_KIND) {
      return { ok: false, reason: "limit" };
    }

    await tx
      .insert(favoriteTeam)
      .values({ userId, source, teamProviderId })
      /** Unreachable under the lock; a caller writing outside it gets a no-op, not an error. */
      .onConflictDoNothing();

    return { ok: true, favorite: true };
  });
}

export async function toggleFavouriteCompetition(
  userId: string,
  region: RegionSegment,
  code: string
): Promise<FavouriteWrite> {
  const where = and(
    eq(favoriteCompetition.userId, userId),
    eq(favoriteCompetition.region, region),
    eq(favoriteCompetition.competitionCode, code)
  );

  return withUserLocked(userId, async (tx) => {
    const removed = await tx
      .delete(favoriteCompetition)
      .where(where)
      .returning({ id: favoriteCompetition.id });
    if (removed.length > 0) return { ok: true, favorite: false };

    if ((await countFor(tx, favoriteCompetition, userId)) >= MAX_FAVOURITES_PER_KIND) {
      return { ok: false, reason: "limit" };
    }

    await tx
      .insert(favoriteCompetition)
      .values({ userId, region, competitionCode: code })
      .onConflictDoNothing();

    return { ok: true, favorite: true };
  });
}

/**
 * Removing something that is not there is not an error: the list already says
 * what it should.
 *
 * decisions/026-favourites.md
 */
export async function removeFavouriteTeam(
  userId: string,
  source: FavouriteSource,
  teamProviderId: number
): Promise<void> {
  await db
    .delete(favoriteTeam)
    .where(
      and(
        eq(favoriteTeam.userId, userId),
        eq(favoriteTeam.source, source),
        eq(favoriteTeam.teamProviderId, teamProviderId)
      )
    );
}

export async function removeFavouriteCompetition(
  userId: string,
  region: RegionSegment,
  code: string
): Promise<void> {
  await db
    .delete(favoriteCompetition)
    .where(
      and(
        eq(favoriteCompetition.userId, userId),
        eq(favoriteCompetition.region, region),
        eq(favoriteCompetition.competitionCode, code)
      )
    );
}

/**
 * The favourites for the session payload, or none when the lookup fails: it
 * runs on every session read, and a throw would take the header down with it.
 *
 * decisions/026-favourites.md
 */
export async function favouritesForSession(userId: string): Promise<Favourites> {
  try {
    return await getFavouriteKeys(userId);
  } catch (error) {
    logger.error({ err: error, userId }, "Reading favourites for the session failed");
    return NO_FAVOURITES;
  }
}

/**
 * One team's most recent appearance, from whichever side it played.
 *
 * decisions/026-favourites.md
 * decisions/027-team-search.md
 */
type TeamSide = {
  id: number;
  name: string;
  competitionCode: string;
  /**
   * TASO's `competition_id`, which is a **season bucket** rather than a
   * competition — `spljp19` for the club game, `maajp18` for national teams.
   * Null for football-data, which has no such split.
   */
  bucket: string | null;
  seasonId: number;
  kickoffAt: Date;
};

/**
 * TASO's national-team season buckets, matched by prefix as one is added every year.
 *
 * decisions/027-team-search.md
 */
const TASO_NATIONAL_BUCKET_PREFIX = "maajp";

/**
 * The categories that say which Finland a TASO team id is: each side's
 * A-friendlies, present in every bucket and played by no one else.
 *
 * decisions/325-taso-finland-links.md
 */
const MENS_FRIENDLIES_CATEGORY = "Miehet-A";
const WOMENS_FRIENDLIES_CATEGORY = "Naiset-A";

/**
 * A team's id route in its region, or null without a region.
 *
 * decisions/325-taso-finland-links.md
 */
function idRouteFor(region: RegionSegment | null, teamProviderId: number): string | null {
  return region === null ? null : `/${region}/joukkue/${teamProviderId}`;
}

/**
 * Which of Finland's two pages a TASO national-team id has, from the categories
 * it played in. Null for both or neither: a wrong link looks like it worked.
 *
 * decisions/325-taso-finland-links.md
 */
function nationalTeamPathFor(categories: Set<string>): string | null {
  const mens = categories.has(MENS_FRIENDLIES_CATEGORY);
  const womens = categories.has(WOMENS_FRIENDLIES_CATEGORY);
  if (mens === womens) return null;
  return mens ? MENS_TEAM.basePath : WOMENS_TEAM.basePath;
}

/**
 * Every category a TASO national-team id has played in: one query, asked only
 * when there is a candidate, as this runs on every session read.
 *
 * decisions/325-taso-finland-links.md
 */
async function nationalCategoriesFor(ids: number[]): Promise<Map<string, Set<string>>> {
  const found = new Map<string, Set<string>>();
  if (ids.length === 0) return found;

  const bucket = `${TASO_NATIONAL_BUCKET_PREFIX}%`;
  const rows = await db
    .selectDistinct({ id: tasoMatches.homeTeamProviderId, category: tasoMatches.categoryId })
    .from(tasoMatches)
    .where(
      and(inArray(tasoMatches.homeTeamProviderId, ids), like(tasoMatches.competitionCode, bucket))
    )
    .union(
      db
        .selectDistinct({ id: tasoMatches.awayTeamProviderId, category: tasoMatches.categoryId })
        .from(tasoMatches)
        .where(
          and(
            inArray(tasoMatches.awayTeamProviderId, ids),
            like(tasoMatches.competitionCode, bucket)
          )
        )
    );

  for (const row of rows) {
    // Keyed by `teamKey`, not by the bare id: the two providers share a numeric
    // id space, and a football-data team numbered like TASO's Finland would
    // otherwise be handed Finland's page.
    const key = teamKey("taso", row.id);
    const held = found.get(key) ?? new Set<string>();
    held.add(row.category);
    found.set(key, held);
  }
  return found;
}

/**
 * Which region owns a team's page, decided by the competition, as one provider
 * spans regions. Null for a competition the registry no longer has.
 *
 * decisions/026-favourites.md
 */
function regionFor(
  source: FavouriteSource,
  competitionCode: string,
  bucket: string | null
): RegionSegment | null {
  if (source === "taso") {
    // Only the club game has a TASO team page; a national-team id gets no region.
    return bucket?.startsWith(TASO_NATIONAL_BUCKET_PREFIX) === true ? null : "kotimaa";
  }
  const registry = regionOfCompetition(competitionCode);
  if (registry === null) return null;
  return registry === "national-teams" ? "maajoukkueet" : "ulkomaat";
}

/**
 * One favourite team, ready to render.
 *
 * decisions/026-favourites.md
 * decisions/027-team-search.md
 * decisions/325-taso-finland-links.md
 */
export type FavouriteTeamView = {
  source: FavouriteSource;
  teamProviderId: number;
  /** From stored matches, or null when nothing is stored for this team. */
  name: string | null;
  /** Where this team's page lives, from where its matches were played; null when unknown. */
  region: RegionSegment | null;
  /**
   * The latest appearance's competition and season, which tell same-named teams apart.
   *
   * decisions/027-team-search.md
   */
  competitionCode: string | null;
  seasonId: number | null;
  /**
   * Where this team's page is, built here once for every caller; null when none.
   *
   * decisions/325-taso-finland-links.md
   */
  href: string | null;
};

/**
 * The names for a set of favourited teams, read from the matches rather than
 * stored, so a renamed club shows its current name. Not scoped by region.
 *
 * decisions/026-favourites.md
 */
export async function resolveTeamNames(
  teams: { source: FavouriteSource; teamProviderId: number }[]
): Promise<FavouriteTeamView[]> {
  const idsFor = (source: FavouriteSource) =>
    teams.filter((team) => team.source === source).map((team) => team.teamProviderId);

  const footballDataIds = idsFor("football-data");
  const tasoIds = idsFor("taso");

  // Each team's most recent appearance, one row per team and side: `distinct on`
  // keeps the current name, and needs a concrete column, hence four queries.
  const noSides = Promise.resolve([] as TeamSide[]);
  const [footballDataHome, footballDataAway, tasoHome, tasoAway] = await Promise.all([
    footballDataIds.length === 0
      ? noSides
      : db
          .selectDistinctOn([matches.homeTeamProviderId], {
            id: matches.homeTeamProviderId,
            name: matches.homeTeamName,
            competitionCode: matches.competitionCode,
            bucket: sql<string | null>`null`,
            seasonId: matches.seasonId,
            kickoffAt: matches.kickoffAt,
          })
          .from(matches)
          .where(inArray(matches.homeTeamProviderId, footballDataIds))
          .orderBy(matches.homeTeamProviderId, desc(matches.kickoffAt)),
    footballDataIds.length === 0
      ? noSides
      : db
          .selectDistinctOn([matches.awayTeamProviderId], {
            id: matches.awayTeamProviderId,
            name: matches.awayTeamName,
            competitionCode: matches.competitionCode,
            bucket: sql<string | null>`null`,
            seasonId: matches.seasonId,
            kickoffAt: matches.kickoffAt,
          })
          .from(matches)
          .where(inArray(matches.awayTeamProviderId, footballDataIds))
          .orderBy(matches.awayTeamProviderId, desc(matches.kickoffAt)),
    tasoIds.length === 0
      ? noSides
      : db
          .selectDistinctOn([tasoMatches.homeTeamProviderId], {
            id: tasoMatches.homeTeamProviderId,
            name: tasoMatches.homeTeamName,
            // TASO's `category_id`, not its `competition_id`: the latter is a
            // season bucket (`spljp19`, `maajp18`) and the former is the
            // competition (`VL`, `WCQ`) that the registries can name.
            competitionCode: tasoMatches.categoryId,
            bucket: tasoMatches.competitionCode,
            seasonId: tasoMatches.seasonId,
            kickoffAt: tasoMatches.kickoffAt,
          })
          .from(tasoMatches)
          .where(inArray(tasoMatches.homeTeamProviderId, tasoIds))
          .orderBy(tasoMatches.homeTeamProviderId, desc(tasoMatches.kickoffAt)),
    tasoIds.length === 0
      ? noSides
      : db
          .selectDistinctOn([tasoMatches.awayTeamProviderId], {
            id: tasoMatches.awayTeamProviderId,
            name: tasoMatches.awayTeamName,
            // TASO's `category_id`, not its `competition_id`: the latter is a
            // season bucket (`spljp19`, `maajp18`) and the former is the
            // competition (`VL`, `WCQ`) that the registries can name.
            competitionCode: tasoMatches.categoryId,
            bucket: tasoMatches.competitionCode,
            seasonId: tasoMatches.seasonId,
            kickoffAt: tasoMatches.kickoffAt,
          })
          .from(tasoMatches)
          .where(inArray(tasoMatches.awayTeamProviderId, tasoIds))
          .orderBy(tasoMatches.awayTeamProviderId, desc(tasoMatches.kickoffAt)),
  ]);

  // The newer of a team's two sides: every club plays home and away.
  const newest = new Map<string, TeamSide>();
  const consider = (source: FavouriteSource, rows: TeamSide[]) => {
    for (const row of rows) {
      const key = teamKey(source, row.id);
      const held = newest.get(key);
      if (held === undefined || held.kickoffAt < row.kickoffAt) newest.set(key, row);
    }
  };
  consider("football-data", footballDataHome);
  consider("football-data", footballDataAway);
  consider("taso", tasoHome);
  consider("taso", tasoAway);

  // Finland is the only TASO national side with a page, and it has two of them.
  // Matched on the name, as `isFinlandMatch` does: TASO gives it no team id
  // that is stable across categories.
  const finlandIds = teams
    .filter((team) => {
      if (team.source !== "taso") return false;
      const row = newest.get(teamKey(team.source, team.teamProviderId));
      return (
        row?.name === FINLAND_TEAM_NAME &&
        row.bucket?.startsWith(TASO_NATIONAL_BUCKET_PREFIX) === true
      );
    })
    .map((team) => team.teamProviderId);

  const finlandCategories = await nationalCategoriesFor(finlandIds);

  return teams.map((team) => {
    const row = newest.get(teamKey(team.source, team.teamProviderId));
    const region =
      row === undefined ? null : regionFor(team.source, row.competitionCode, row.bucket);
    const national = finlandCategories.get(teamKey(team.source, team.teamProviderId));
    const href =
      national === undefined
        ? idRouteFor(region, team.teamProviderId)
        : nationalTeamPathFor(national);

    return {
      ...team,
      // Null rather than a placeholder: the page says so in Finnish, and the
      // entry stays removable — a favourite nobody can delete would be worse
      // than one with no name.
      name: row?.name ?? null,
      region,
      competitionCode: row?.competitionCode ?? null,
      seasonId: row?.seasonId ?? null,
      href,
    };
  });
}
