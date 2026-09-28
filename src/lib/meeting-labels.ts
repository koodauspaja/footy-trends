/**
 * What to call the competition a meeting was played in.
 *
 * The head-to-head deliberately spans competitions (specs/019, specs/042 S2),
 * so this column is the only signal for which one a meeting belonged to — and
 * TASO's `group_name` names a *stage* instead: `5. Kierros` leaves a cup tie
 * looking like a league round, and on the national-team side it can be `2024`,
 * `Slovakia` or `Heinäkuu`. See #251.
 *
 * Two different lookups behind one column: a domestic row's category maps to a
 * competition in our own registry, while a national-team row's name lives only
 * in TASO's category map. The group name stays as the fallback for a row
 * nothing can name — a category the picker does not claim, or a map that could
 * not be read — which costs one line rather than the page.
 *
 * **Extracted from `match-page.tsx` for specs/042**, where the full head-to-head
 * page needs the same labels for the same rows. Two copies of this would be two
 * answers to "which competition was that", and the column exists precisely
 * because the answer is not obvious from the row.
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

/** Always `Kilpailu`: a competition name where one resolves, TASO's series name otherwise. */
export const COMPETITION_COLUMN = "Kilpailu";

/** A row with the fourth column's text already resolved. */
export type Labelled<T> = T & { label: string };

/**
 * TASO's category names for one provider bucket, or `null` if it cannot be
 * asked.
 *
 * The two season arguments decide the cache TTL, and only that: a bucket at or
 * above the active year is treated as still changing and cached for fifteen
 * minutes, an older one as settled and cached for a year. So the bucket's own
 * season goes first and `NATIONAL_TEAM_ACTIVE_YEAR` second — passing the active
 * year twice makes every bucket look current, which is the fifteen-minute
 * re-fetch this is meant to avoid.
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
 * `getCached` does not deduplicate in-flight misses, so on a cold cache every
 * caller sees the miss and fetches the same map. A match page asks about the
 * match it displays and up to five previous meetings; a full history asks about
 * every meeting, which makes the memo matter more rather than less.
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
 * A category name as a competition label, with the team suffix stripped.
 *
 * The suffix belongs to whichever team the category names, not to the team
 * whose page this is: a Helmarit row reached from a Huuhkajat match must lose
 * `Helmarit`, not `Huuhkajat`.
 */
export function labelFromCategoryName(team: NationalTeam, categoryName: string): string {
  const owner = [MENS_TEAM, WOMENS_TEAM].find((candidate) =>
    categoryName.endsWith(candidate.categorySuffix)
  );
  return competitionLabel(owner ?? team, categoryName);
}

/**
 * The competition a single national-team match belonged to, normalised — or
 * `null` when TASO's map does not name it.
 */
export async function resolveNationalCompetitionName(
  team: NationalTeam,
  match: TasoMatchRow,
  names: CategoryNames
): Promise<string | null> {
  const categoryName = (await names(match.competitionCode, match.seasonId))?.[match.categoryId];
  return categoryName === undefined ? null : labelFromCategoryName(team, categoryName);
}

/** Each football-data row labelled by its competition, which its code names directly. */
export function labelFootballDataRows(
  rows: readonly FootballDataMatchRow[]
): Array<Labelled<FootballDataMatchRow>> {
  return rows.map((row) => ({ ...row, label: getCompetitionName(row.competitionCode) }));
}

/** Each TASO row labelled by its competition, through whichever of the two lookups applies. */
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
