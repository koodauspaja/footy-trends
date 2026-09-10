import { and, desc, ne, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, tasoMatches } from "@/db/schema";
import { competitionNameFor } from "@/lib/competition-preferences";
import type { FavouriteSource } from "@/lib/favourite-keys";
import { resolveTeamNames } from "@/lib/favourites";
import type { RegionSegment } from "@/lib/regions";

/**
 * Finding a team by name, from specs/027-team-search.md.
 *
 * **Two steps, deliberately separate.** This module finds the ids whose *any*
 * recorded name matches, and `resolveTeamNames` says what each of those teams
 * is called **now**. Doing both in one query would show a club's old name
 * whenever an old name is what matched, which is the opposite of useful for
 * someone searching a club they remember under a former name.
 */

/** Short enough to be worth typing, long enough that one keystroke scans nothing. */
export const MIN_TERM_LENGTH = 2;

/**
 * How many results a search returns.
 *
 * Agreed rather than measured. A reader who cannot find their team in twenty
 * should type more — and one common name fills half of that on its own, since
 * `FC Honka` alone carries nine distinct ids.
 */
export const MAX_RESULTS = 20;

/**
 * Finnish letters folded to their plain forms, in SQL.
 *
 * `translate` rather than `unaccent`: the extension is available but **not
 * installed**, so it would need a `CREATE EXTENSION` migration and the
 * privilege to run it on the platform — for a fold that three character pairs
 * describe completely. `translate` is also `IMMUTABLE`, which `unaccent` is not,
 * so an expression index over it is possible at all.
 */
const FOLD_FROM = "äöåÄÖÅ";
const FOLD_TO = "aoaAOA";

function foldedColumn(column: SQL | ReturnType<typeof sql.raw>): SQL<string> {
  return sql<string>`translate(lower(${column}), ${FOLD_FROM}, ${FOLD_TO})`;
}

/**
 * The same fold, applied to what the reader typed.
 *
 * Applied to both sides is what makes matching symmetric: folding only the
 * stored name finds `Järvenpää` from `jarvenpaa` but not from `Järvenpää`, and
 * folding only the term does the reverse.
 */
export function foldTerm(term: string): string {
  const lowered = term.trim().toLowerCase();
  let folded = "";
  for (const character of lowered) {
    const index = FOLD_FROM.indexOf(character);
    folded += index === -1 ? character : (FOLD_TO[index] as string);
  }
  return folded;
}

/**
 * `%` and `_` are wildcards to `LIKE`, so a reader typing either would match far
 * more than they asked for — one `%` matches every team there is.
 *
 * `\` first, or escaping the wildcards would then escape their own escapes.
 */
export function escapeLike(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Whether a term is worth querying for at all. */
export function isSearchable(term: string): boolean {
  return term.trim().length >= MIN_TERM_LENGTH;
}

/** One team a search found, ready to render. */
export type TeamSearchView = {
  source: FavouriteSource;
  teamProviderId: number;
  name: string;
  region: RegionSegment | null;
  /** The Finnish competition name, or null when the registry no longer has it. */
  competitionName: string | null;
  seasonId: number | null;
};

/** A team id with the newest match that matched, which is only used for ordering. */
type Hit = { source: FavouriteSource; teamProviderId: number; kickoffAt: Date };

/**
 * TASO's placeholder for a bracket slot nobody has qualified into yet, and the
 * one stored team with no name at all. Neither is a team a reader can open, and
 * spec 019 already keeps both off the match page.
 */
const PLACEHOLDER_TEAM_ID = 0;

export async function searchTeams(term: string): Promise<TeamSearchView[]> {
  if (!isSearchable(term)) return [];

  const pattern = `%${escapeLike(foldTerm(term))}%`;

  /**
   * Four queries, one per searched column, mirroring `resolveTeamNames`.
   * `distinct on` collapses each team to its newest matching row, so a club with
   * two hundred matches contributes one.
   */
  const hits = await Promise.all(
    (
      [
        [matches, matches.homeTeamProviderId, matches.homeTeamName, "football-data"],
        [matches, matches.awayTeamProviderId, matches.awayTeamName, "football-data"],
        [tasoMatches, tasoMatches.homeTeamProviderId, tasoMatches.homeTeamName, "taso"],
        [tasoMatches, tasoMatches.awayTeamProviderId, tasoMatches.awayTeamName, "taso"],
      ] as const
    ).map(async ([table, idColumn, nameColumn, source]) => {
      const rows = await db
        .selectDistinctOn([idColumn], {
          teamProviderId: idColumn,
          kickoffAt: table.kickoffAt,
        })
        .from(table)
        .where(
          and(
            sql`${foldedColumn(sql`${nameColumn}`)} like ${pattern}`,
            ne(idColumn, PLACEHOLDER_TEAM_ID),
            ne(nameColumn, "")
          )
        )
        .orderBy(idColumn, desc(table.kickoffAt))
        .limit(MAX_RESULTS);

      return rows.map((row) => ({ ...row, source }) as Hit);
    })
  );

  /**
   * A team appears from both its home and away rows; the newer wins, because
   * that is what the ordering is meant to reflect.
   */
  const newest = new Map<string, Hit>();
  for (const hit of hits.flat()) {
    const key = `${hit.source}:${hit.teamProviderId}`;
    const held = newest.get(key);
    if (held === undefined || held.kickoffAt < hit.kickoffAt) newest.set(key, hit);
  }

  const ordered = [...newest.values()]
    .sort((left, right) => right.kickoffAt.getTime() - left.kickoffAt.getTime())
    .slice(0, MAX_RESULTS);

  // The display name comes from each team's newest match overall, not from the
  // row that matched — a renamed club is found by its old name and shown under
  // its current one.
  const resolved = await resolveTeamNames(
    ordered.map(({ source, teamProviderId }) => ({ source, teamProviderId }))
  );

  return resolved
    .filter((team): team is typeof team & { name: string } => team.name !== null)
    .map((team) => ({
      source: team.source,
      teamProviderId: team.teamProviderId,
      name: team.name,
      region: team.region,
      competitionName:
        team.region === null || team.competitionCode === null
          ? null
          : competitionNameFor(team.region, team.competitionCode),
      seasonId: team.seasonId,
    }));
}
