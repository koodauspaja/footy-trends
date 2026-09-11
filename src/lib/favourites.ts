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
 * Reading and writing one reader's favourites, from specs/026-favourites.md.
 *
 * Two tables rather than one with a `kind`, for the reason the schema states:
 * the two identities have different shapes, and one table would hold four
 * nullable columns and a rule about which pair is legal.
 */

/** The transaction handle drizzle hands `db.transaction`. */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type Favourites = { teams: string[]; competitions: string[] };

export const NO_FAVOURITES: Favourites = { teams: [], competitions: [] };

/**
 * The favourite's state **after** the write, or why there was none.
 *
 * `favorite` answers "is it one now", not "did this statement insert a row" —
 * which is what the star renders, and what makes an insert that lost a race to
 * an identical one still a true `true`.
 */
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

/**
 * Runs a toggle with this reader's `user` row locked.
 *
 * **The cap needs it.** Counting and then inserting is two statements, and two
 * tabs at forty-nine both read forty-nine and both insert — the unique index
 * does not object, because they are different favourites. Read Committed does
 * not help: each statement takes its own snapshot, so a conditional insert
 * races the same way.
 *
 * The lock is on the reader's own `user` row, so it serialises only that
 * reader's favourite writes — a toggle waits for their other tab and for
 * nobody else.
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
 * Adds the team if it is missing, removes it if it is there.
 *
 * A toggle rather than separate add and remove calls, because the control is a
 * toggle: two actions would mean the client deciding which to call from state
 * it might have wrong.
 *
 * **Two concurrent toggles of the same team flip it twice**, and it ends where
 * it started. That is what a toggle means, and it is now honest rather than
 * accidental: before the row lock, both transactions found nothing to delete
 * and both inserted, and the unique index quietly turned the second into a
 * no-op. Each caller is still told what its own write did, so a tab never
 * shows a state the database does not have. The button is disabled while its
 * own request is in flight, so this needs two tabs, not two clicks.
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
      /**
       * Unreachable through this function — the lock serialises a reader's
       * writes, and the delete above already ran — and kept anyway, so that a
       * future caller writing outside the lock degrades to a no-op instead of
       * an error the reader would have to understand. The unique index is the
       * thing that makes it true; this only chooses what happens when it fires.
       */
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

/** One team's most recent appearance, from whichever side it played. */
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
 * TASO's season buckets for national-team football.
 *
 * These decide whether a TASO team has a page at all, so the prefix is checked
 * rather than the exact id: the set grows by one every year (`maajp2026` and so
 * on), and a list would silently start sending next season's teams to the wrong
 * place.
 */
const TASO_NATIONAL_BUCKET_PREFIX = "maajp";

/**
 * The two categories that say which Finland a TASO team id is, from #325.
 *
 * **Why these two and not the tournament categories.** Both national sides carry
 * an A-friendlies category in *every* bucket, and its id is the same either side
 * of TASO's `Muut` rename — `national-team.ts` records that. The tournament ids
 * cannot be used: a `W` prefix looks like it marks the women's game until you
 * meet `WCQ`, which is the men's World Cup qualifiers.
 *
 * The competition *names* would answer it directly, by the ` Huuhkajat` and
 * ` Helmarit` suffixes — but those come from a live TASO call, and this runs on
 * every session read.
 */
const MENS_FRIENDLIES_CATEGORY = "Miehet-A";
const WOMENS_FRIENDLIES_CATEGORY = "Naiset-A";

/**
 * Where a TASO national side's page is, or null when nothing can be said.
 *
 * Only Finland has one at all — the opponents appear in TASO's data without
 * having pages anywhere — and Finland has **two**, so the answer has to come
 * from the categories the id actually played in.
 *
 * Null when the id carries both, or neither: an id that is somehow both teams
 * cannot be sent to one of them, and #247 already renders an unlinked row
 * honestly. A wrong link is worse than no link, because it looks like it worked.
 */
function nationalTeamPathFor(categories: Set<string>): string | null {
  const mens = categories.has(MENS_FRIENDLIES_CATEGORY);
  const womens = categories.has(WOMENS_FRIENDLIES_CATEGORY);
  if (mens === womens) return null;
  return mens ? MENS_TEAM.basePath : WOMENS_TEAM.basePath;
}

/**
 * Every category a TASO national-team id has played in.
 *
 * One query for all of them, and only asked when a candidate exists —
 * `resolveTeamNames` runs on every session read, and Finland is a handful of
 * rows out of thousands.
 */
async function nationalCategoriesFor(ids: number[]): Promise<Map<number, Set<string>>> {
  const found = new Map<number, Set<string>>();
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
    const held = found.get(row.id) ?? new Set<string>();
    held.add(row.category);
    found.set(row.id, held);
  }
  return found;
}

/**
 * Which region owns a team's page.
 *
 * The competition decides it, because the provider does not: Finland's national
 * side and a Spanish club are both `football-data` teams, and their pages live
 * under `/maajoukkueet` and `/ulkomaat`. Null for a competition the registry no
 * longer has — better an unlinked row than a link to some other club.
 */
function regionFor(
  source: FavouriteSource,
  competitionCode: string,
  bucket: string | null
): RegionSegment | null {
  if (source === "taso") {
    /**
     * Only the club game has a TASO team page. `/maajoukkueet/joukkue/[id]` is
     * football-data's, built by `CompetitionTeamPage`, so a TASO national-team
     * id resolves to nothing there — and `/kotimaa/joukkue/[id]` is scoped to
     * `{ kind: "taso", bucket: "domestic" }`, so it cannot find one either.
     *
     * Null rather than a guess: a row that is not a link is honest, and both
     * `/suosikit` and the search results already render that case.
     */
    return bucket?.startsWith(TASO_NATIONAL_BUCKET_PREFIX) === true ? null : "kotimaa";
  }
  const registry = regionOfCompetition(competitionCode);
  if (registry === null) return null;
  return registry === "national-teams" ? "maajoukkueet" : "ulkomaat";
}

/** One favourite team, ready to render. */
export type FavouriteTeamView = {
  source: FavouriteSource;
  teamProviderId: number;
  /** From stored matches, or null when nothing is stored for this team. */
  name: string | null;
  /**
   * Where this team's page lives, or null when we could not tell.
   *
   * Derived, never stored. A favourite is `(source, teamProviderId)` and
   * deliberately carries no region — but `football-data` covers both club
   * competitions and national sides, which live under different URLs, so the
   * region has to come from the competitions its matches were played in.
   */
  region: RegionSegment | null;
  /**
   * The competition and season of that most recent appearance, or null when
   * nothing is stored.
   *
   * Carried for specs/027, where a result row has to tell two teams sharing a
   * name apart — `FC Honka` is nine different teams. They come from the row this
   * function already reads, so answering them costs nothing extra.
   */
  competitionCode: string | null;
  seasonId: number | null;
  /**
   * Where this team's page is, or null when it has none.
   *
   * Built here rather than by each caller. `/suosikit` and team search were
   * deriving `/${region}/joukkue/${id}` independently, so Finland's national
   * sides — whose pages are `/maajoukkueet/huuhkajat` and
   * `/maajoukkueet/helmarit`, not an id route at all — would have needed the
   * same exception written twice (#325).
   */
  href: string | null;
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

  /**
   * One row per team, carrying that team's **most recent** appearance.
   *
   * `distinct on` rather than a plain `select distinct`: a club that renamed has
   * matches stored under both names, and a `Map` filled from unordered rows
   * shows whichever the planner happened to return last. The whole reason names
   * are resolved rather than stored is to show the *current* one, so the
   * ordering is the feature rather than a detail.
   *
   * It is also far less data — one row per team instead of one per match.
   */
  /**
   * Four queries rather than one clever one, and written out rather than
   * abstracted: `distinct on` needs the concrete column to group by, and a
   * helper taking a union of two tables' columns loses exactly the typing that
   * makes this safe. Each returns at most one row per team.
   */
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

  /** The newer of a team's two sides: every club plays home and away. */
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

  /**
   * Finland is the only TASO national side with a page, and it has two of them.
   * Matched on the **name**: `isFinlandMatch` does the same, because TASO gives
   * it no team id that is stable across categories.
   */
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
    const national = finlandCategories.get(team.teamProviderId);
    const href =
      national !== undefined
        ? nationalTeamPathFor(national)
        : region === null || row === undefined
          ? null
          : `/${region}/joukkue/${team.teamProviderId}`;

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
