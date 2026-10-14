/**
 * What to call the competition a meeting was played in. A domestic row's
 * category maps to a competition in the registry, a national-team row's name
 * comes from TASO's category map, and the group name is the fallback.
 *
 * decisions/019-match-page.md
 * decisions/042-head-to-head-view.md
 */
import { getCompetitionName } from "./competitions";
import { competitionCodeForCategory, getDomesticCompetitionName } from "./domestic-competitions";
import { logger } from "./logger";
import type { FootballDataMatchRow, TasoMatchRow } from "./match-service";
import {
  competitionLabel,
  MENS_TEAM,
  NATIONAL_TEAM_ACTIVE_YEAR,
  type NationalTeam,
  WOMENS_TEAM,
} from "./national-team";
import { getSeasonCategoryNameMap } from "./taso-standings-service";

/**
 * Always `Kilpailu`: a competition name where one resolves, TASO's series name otherwise.
 *
 * decisions/042-head-to-head-view.md
 */
export const COMPETITION_COLUMN = "Kilpailu";

/**
 * A row with the fourth column's text already resolved.
 *
 * decisions/042-head-to-head-view.md
 */
export type Labelled<T> = T & { label: string };

/**
 * TASO's category names for one provider bucket, or `null` if it cannot be
 * asked. The two season arguments decide the cache TTL only: the bucket's own
 * season first, `NATIONAL_TEAM_ACTIVE_YEAR` second.
 *
 * decisions/042-head-to-head-view.md
 */
async function loadCategoryNames(
  competitionCode: string,
  seasonId: number
): Promise<Record<string, string> | null> {
  try {
    return await getSeasonCategoryNameMap(competitionCode, seasonId, NATIONAL_TEAM_ACTIVE_YEAR);
  } catch (error) {
    logger.error({ err: error, competitionId: competitionCode }, "Unable to read TASO categories");
    return null;
  }
}

export type CategoryNames = (
  competitionCode: string,
  seasonId: number
) => Promise<Record<string, string> | null>;

/**
 * A per-render memo over `loadCategoryNames`, keyed by bucket.
 *
 * decisions/042-head-to-head-view.md
 */
export function categoryNameLoader(): CategoryNames {
  const byBucket = new Map<string, Promise<Record<string, string> | null>>();
  // Keyed by bucket alone: a bucket has one season, so the season only ever
  // repeats what the key already says.
  return (competitionCode, seasonId) => {
    const pending = byBucket.get(competitionCode);
    if (pending !== undefined) return pending;
    const started = loadCategoryNames(competitionCode, seasonId);
    byBucket.set(competitionCode, started);
    return started;
  };
}

/**
 * A category name as a competition label, with the team suffix stripped. The
 * suffix is that of the team the category names, not the team whose page this is.
 *
 * decisions/042-head-to-head-view.md
 */
export function labelFromCategoryName(team: NationalTeam, categoryName: string): string {
  const owner = [MENS_TEAM, WOMENS_TEAM].find((candidate) =>
    categoryName.endsWith(candidate.categorySuffix)
  );
  return competitionLabel(owner ?? team, categoryName);
}

/**
 * The competition a single national-team match belonged to, normalised, or
 * `null` when TASO's map does not name it.
 *
 * decisions/019-match-page.md
 * decisions/042-head-to-head-view.md
 */
export async function resolveNationalCompetitionName(
  team: NationalTeam,
  match: TasoMatchRow,
  names: CategoryNames
): Promise<string | null> {
  const categoryName = (await names(match.competitionCode, match.seasonId))?.[match.categoryId];
  return categoryName === undefined ? null : labelFromCategoryName(team, categoryName);
}

/**
 * Each football-data row labelled by its competition, which its code names directly.
 *
 * decisions/042-head-to-head-view.md
 */
export function labelFootballDataRows(
  rows: readonly FootballDataMatchRow[]
): Array<Labelled<FootballDataMatchRow>> {
  return rows.map((row) => ({ ...row, label: getCompetitionName(row.competitionCode) }));
}

/**
 * Each TASO row labelled by its competition, through whichever of the two lookups applies.
 *
 * decisions/042-head-to-head-view.md
 */
export async function labelTasoRows(
  team: NationalTeam | undefined,
  rows: readonly TasoMatchRow[],
  names: CategoryNames
): Promise<Array<Labelled<TasoMatchRow>>> {
  // A domestic row's competition is in our own registry, so nothing is fetched
  // and nothing is awaited — `Promise.all` over plain values would say
  // otherwise.
  if (team === undefined) {
    return rows.map((row) => {
      const code = competitionCodeForCategory(row.categoryId);
      return { ...row, label: code === null ? row.groupName : getDomesticCompetitionName(code) };
    });
  }

  return Promise.all(
    rows.map(async (row) => {
      const categoryName = (await names(row.competitionCode, row.seasonId))?.[row.categoryId];
      return {
        ...row,
        label:
          categoryName === undefined ? row.groupName : labelFromCategoryName(team, categoryName),
      };
    })
  );
}
