import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { favoriteCompetition, favoriteTeam, matches, tasoMatches } from "@/db/schema";
import {
  competitionKey,
  type FavouriteSource,
  MAX_FAVOURITES_PER_KIND,
  teamKey,
} from "@/lib/favourite-keys";
import { logger } from "@/lib/logger";
import type { RegionSegment } from "@/lib/regions";

/**
 * Reading and writing one reader's favourites, from specs/026-favourites.md.
 *
 * Two tables rather than one with a `kind`, for the reason the schema states:
 * the two identities have different shapes, and one table would hold four
 * nullable columns and a rule about which pair is legal.
 */

export type Favourites = { teams: string[]; competitions: string[] };

export const NO_FAVOURITES: Favourites = { teams: [], competitions: [] };

/** Whether the write happened, or why it did not. */
export type FavouriteWrite = { ok: true; favorite: boolean } | { ok: false; reason: "limit" };

/**
 * Both lists as keys, for the session payload.
 *
 * Keys rather than rows because the only thing the client does with them is
 * ask whether one is present — see `favourite-keys.ts`.
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
    // Cast at the edge: the column is plain text, and a source that is no
    // longer one of the two would produce a key nothing matches, which is the
    // right outcome — it renders as "not a favourite" rather than as an error.
    teams: teams.map((row) => teamKey(row.source as FavouriteSource, row.teamProviderId)),
    competitions: competitions.map((row) =>
      competitionKey(row.region as RegionSegment, row.competitionCode)
    ),
  };
}

async function countFor(
  table: typeof favoriteTeam | typeof favoriteCompetition,
  userId: string
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(eq(table.userId, userId));
  return row?.n ?? 0;
}

/**
 * Adds the team if it is missing, removes it if it is there.
 *
 * A toggle rather than separate add and remove calls, because the control is a
 * toggle: two actions would mean the client deciding which to call from state
 * it might have wrong, and a double click sending the same add twice.
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

  const removed = await db.delete(favoriteTeam).where(where).returning({ id: favoriteTeam.id });
  if (removed.length > 0) return { ok: true, favorite: false };

  // Counted after the delete, so unfavouriting at the cap always works — a
  // reader who cannot remove one because they have too many would be stuck.
  if ((await countFor(favoriteTeam, userId)) >= MAX_FAVOURITES_PER_KIND) {
    return { ok: false, reason: "limit" };
  }

  await db
    .insert(favoriteTeam)
    .values({ userId, source, teamProviderId })
    // Two tabs, or a double click: the unique index makes the second a no-op
    // rather than an error the reader has to understand.
    .onConflictDoNothing();

  return { ok: true, favorite: true };
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

  const removed = await db
    .delete(favoriteCompetition)
    .where(where)
    .returning({ id: favoriteCompetition.id });
  if (removed.length > 0) return { ok: true, favorite: false };

  if ((await countFor(favoriteCompetition, userId)) >= MAX_FAVOURITES_PER_KIND) {
    return { ok: false, reason: "limit" };
  }

  await db
    .insert(favoriteCompetition)
    .values({ userId, region, competitionCode: code })
    .onConflictDoNothing();

  return { ok: true, favorite: true };
}

/** Removing something that is not there is not an error — the list already says what it should. */
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
 * The favourites for the session payload, or none when the lookup fails.
 *
 * Swallowed like `getSessionExtrasFor`'s other reads: this runs inside
 * better-auth's `customSession` on every `/api/auth/get-session`, so throwing
 * would take the header down with it. A reader whose stars are briefly missing
 * has lost less than one who cannot see they are signed in.
 */
export async function favouritesForSession(userId: string): Promise<Favourites> {
  try {
    return await getFavouriteKeys(userId);
  } catch (error) {
    logger.error({ err: error, userId }, "Reading favourites for the session failed");
    return NO_FAVOURITES;
  }
}

/** One favourite team, ready to render. */
export type FavouriteTeamView = {
  source: FavouriteSource;
  teamProviderId: number;
  /** From stored matches, or null when nothing is stored for this team. */
  name: string | null;
};

/**
 * The names for a set of favourited teams, in two queries rather than two per
 * team.
 *
 * **Not stored on the row.** A club that renames would otherwise show its old
 * name until someone re-favourited it, and #254 exists precisely because a
 * renamed club has to be told apart from one that does not exist. The match
 * tables already hold the current name.
 *
 * Unscoped by region on purpose: the region only narrows an index, and a
 * favourite deliberately does not carry one — specs/022 established that a team
 * spans competitions. Fifty ids in one `IN` is a cheaper way to be right than
 * fifty region guesses.
 */
export async function resolveTeamNames(
  teams: { source: FavouriteSource; teamProviderId: number }[]
): Promise<FavouriteTeamView[]> {
  const idsFor = (source: FavouriteSource) =>
    teams.filter((team) => team.source === source).map((team) => team.teamProviderId);

  const footballDataIds = idsFor("football-data");
  const tasoIds = idsFor("taso");

  const [footballDataRows, tasoRows] = await Promise.all([
    footballDataIds.length === 0
      ? Promise.resolve([])
      : db
          .selectDistinct({
            homeId: matches.homeTeamProviderId,
            homeName: matches.homeTeamName,
            awayId: matches.awayTeamProviderId,
            awayName: matches.awayTeamName,
          })
          .from(matches)
          .where(
            or(
              inArray(matches.homeTeamProviderId, footballDataIds),
              inArray(matches.awayTeamProviderId, footballDataIds)
            )
          ),
    tasoIds.length === 0
      ? Promise.resolve([])
      : db
          .selectDistinct({
            homeId: tasoMatches.homeTeamProviderId,
            homeName: tasoMatches.homeTeamName,
            awayId: tasoMatches.awayTeamProviderId,
            awayName: tasoMatches.awayTeamName,
          })
          .from(tasoMatches)
          .where(
            or(
              inArray(tasoMatches.homeTeamProviderId, tasoIds),
              inArray(tasoMatches.awayTeamProviderId, tasoIds)
            )
          ),
  ]);

  const names = new Map<string, string>();
  const remember = (source: FavouriteSource, rows: typeof footballDataRows) => {
    for (const row of rows) {
      names.set(teamKey(source, row.homeId), row.homeName);
      names.set(teamKey(source, row.awayId), row.awayName);
    }
  };
  remember("football-data", footballDataRows);
  remember("taso", tasoRows);

  return teams.map((team) => ({
    ...team,
    // Null rather than a placeholder: the page says so in Finnish, and the
    // entry stays removable — a favourite nobody can delete would be worse
    // than one with no name.
    name: names.get(teamKey(team.source, team.teamProviderId)) ?? null,
  }));
}
