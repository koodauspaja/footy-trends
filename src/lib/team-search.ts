import { and, desc, ne, type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { matches, tasoMatches } from "@/db/schema";
import { competitionNameFor } from "@/lib/competition-preferences";
import type { FavouriteSource } from "@/lib/favourite-keys";
import { resolveTeamNames } from "@/lib/favourites";
import { PLACEHOLDER_TEAM_ID } from "@/lib/match-detail";
import type { RegionSegment } from "@/lib/regions";

/**
 * Finding a team by name: the ids whose any recorded name matches. What each
 * is called now is `resolveTeamNames`' answer, a separate step.
 *
 * decisions/027-team-search.md
 */

/**
 * Short enough to be worth typing, long enough that one keystroke scans nothing.
 *
 * decisions/027-team-search.md
 */
export const MIN_TERM_LENGTH = 2;

/**
 * How many results a search returns.
 *
 * decisions/027-team-search.md
 */
export const MAX_RESULTS = 20;

/**
 * Finnish letters folded to their plain forms, in SQL, with `translate`.
 *
 * decisions/027-team-search.md
 */
const FOLD_FROM = "äöåÄÖÅ";
const FOLD_TO = "aoaAOA";

function foldedColumn(column: PgColumn): SQL<string> {
  return sql<string>`translate(lower(${column}), ${FOLD_FROM}, ${FOLD_TO})`;
}

/**
 * The same fold, applied to what the reader typed, so matching is symmetric.
 *
 * decisions/027-team-search.md
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
 * Escapes `%`, `_` and `\`, which `LIKE` reads as wildcards and its escape, in
 * one pass.
 *
 * decisions/027-team-search.md
 */
export function escapeLike(term: string): string {
  return term.replaceAll(/[\\%_]/g, String.raw`\$&`);
}

/**
 * Whether a term is worth querying for at all.
 *
 * decisions/027-team-search.md
 */
export function isSearchable(term: string): boolean {
  return term.trim().length >= MIN_TERM_LENGTH;
}

/**
 * One team a search found, ready to render.
 *
 * decisions/027-team-search.md
 */
export type TeamSearchView = {
  source: FavouriteSource;
  teamProviderId: number;
  name: string;
  region: RegionSegment | null;
  /** Where this team's page is, or null when it has none. Built by `resolveTeamNames`. */
  href: string | null;
  /** The Finnish competition name, or null when the registry no longer has it. */
  competitionName: string | null;
  seasonId: number | null;
};

/**
 * A team id with the newest match that matched, which is only used for ordering.
 *
 * decisions/027-team-search.md
 */
type Hit = { source: FavouriteSource; teamProviderId: number; kickoffAt: Date };

export async function searchTeams(term: string): Promise<TeamSearchView[]> {
  if (!isSearchable(term)) return [];

  const pattern = `%${escapeLike(foldTerm(term))}%`;

  // Four queries, one per searched column. `distinct on` is a subquery and the cap
  // sits on the outer select, so the cap keeps the newest teams, not the lowest ids.
  const hits = await Promise.all(
    (
      [
        [matches, matches.homeTeamProviderId, matches.homeTeamName, "football-data"],
        [matches, matches.awayTeamProviderId, matches.awayTeamName, "football-data"],
        [tasoMatches, tasoMatches.homeTeamProviderId, tasoMatches.homeTeamName, "taso"],
        [tasoMatches, tasoMatches.awayTeamProviderId, tasoMatches.awayTeamName, "taso"],
      ] as const
    ).map(async ([table, idColumn, nameColumn, source]) => {
      const newestPerTeam = db
        .selectDistinctOn([idColumn], {
          teamProviderId: idColumn,
          kickoffAt: table.kickoffAt,
        })
        .from(table)
        .where(
          and(
            sql`${foldedColumn(nameColumn)} like ${pattern}`,
            ne(idColumn, PLACEHOLDER_TEAM_ID),
            ne(nameColumn, "")
          )
        )
        .orderBy(idColumn, desc(table.kickoffAt))
        .as("newest_per_team");

      const rows = await db
        .select({
          teamProviderId: newestPerTeam.teamProviderId,
          kickoffAt: newestPerTeam.kickoffAt,
        })
        .from(newestPerTeam)
        .orderBy(desc(newestPerTeam.kickoffAt))
        .limit(MAX_RESULTS);

      return rows.map((row) => ({ ...row, source }) as Hit);
    })
  );

  // A team appears from both its home and away rows; the newer wins.
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
      href: team.href,
      competitionName:
        team.region === null || team.competitionCode === null
          ? null
          : competitionNameFor(team.region, team.competitionCode),
      seasonId: team.seasonId,
    }));
}
