import {
  categoryIdForSeason,
  competitionIdForSeason,
  DEFAULT_DOMESTIC_COMPETITION_CODE,
  type DomesticCompetitionParamResult,
  earliestSeasonFor,
  getDomesticCompetitionName,
  parseDomesticCompetitionParam,
} from "./domestic-competitions";
import type { SeasonOption, SeasonParamResult } from "./seasons";
import { getSeasonCategoryName, resolveTasoSeasonContext } from "./taso-standings-service";
import type { TeamContext } from "./team-context";

/**
 * A Finnish season is a single calendar year, not a year-spanning one like the
 * foreign leagues — the label is just the year. Descending, newest first, same
 * convention as `listSelectableSeasons`.
 *
 * The floor is per competition rather than provider-wide: Ykkösliiga did not
 * exist before 2024, and offering its 2015 would render an empty page. See
 * specs/013-more-finnish-competitions.md.
 */
export function listSelectableTasoSeasons(
  currentSeason: number,
  earliestSeason: number
): SeasonOption[] {
  const options: SeasonOption[] = [];
  for (let year = currentSeason; year >= earliestSeason; year -= 1) {
    options.push({ seasonId: year, label: String(year) });
  }
  return options;
}

/**
 * Validates the `kausi` query parameter against the selectable range. The
 * range's upper end is discovered rather than fixed, so a season that was
 * invalid last year becomes valid without a deploy.
 */
export function parseTasoSeasonParam(
  rawValue: string | string[] | undefined,
  selectable: SeasonOption[]
): SeasonParamResult {
  if (rawValue === undefined) return { kind: "absent" };
  if (typeof rawValue !== "string" || !/^\d+$/.test(rawValue)) return { kind: "invalid" };

  const seasonId = Number(rawValue);
  return selectable.some((option) => option.seasonId === seasonId)
    ? { kind: "valid", seasonId }
    : { kind: "invalid" };
}

export type DomesticPageContext = {
  /** The discovered season: the selector ceiling, and what `needsRefresh` treats as current. */
  currentSeason: number;
  competitionCode: string;
  competitionParam: DomesticCompetitionParamResult;
  competitionName: string;
  selectableSeasons: SeasonOption[];
  season: SeasonParamResult;
  seasonId: number;
  seasonLabel: string;
  competitionId: string;
  /** The `category_id` to query for this competition in this season. */
  categoryId: string;
  /**
   * The name this competition carried in this season, which is not always the
   * name it carries now — TASO renamed `NL` twice between 2015 and 2025.
   * Falls back to the configured current name when TASO cannot be asked.
   */
  seasonCompetitionName: string;
  /**
   * The current name, but only when it differs from the season's own. Drives
   * the "nykyisin …" line, which is shown only on a difference.
   */
  renamedTo: string | null;
};

/**
 * Resolves the competition and season context shared by every `/kotimaa`
 * page's `generateMetadata` and page component — the `kilpailu`/`kausi`-param
 * analogue of `resolveBasePageContext`.
 *
 * Async because the season ceiling now comes from TASO rather than a
 * constant, but there is still no `"error"` status to handle: discovery
 * failure falls back inside `resolveTasoSeasonContext` rather than
 * surfacing here.
 */
export async function resolveDomesticPageContext(
  params: Record<string, string | string[] | undefined>,
  /**
   * What to use where the URL says nothing — a team's own newest stored
   * context, on the pages that have one. Omitted everywhere else, which leaves
   * the region's defaults exactly as they were. See
   * specs/020-context-free-team-page.md.
   */
  defaults?: TeamContext
): Promise<DomesticPageContext> {
  const competitionParam = parseDomesticCompetitionParam(params.kilpailu);
  const competitionCode =
    competitionParam.kind === "valid"
      ? competitionParam.code
      : (defaults?.competitionCode ?? DEFAULT_DOMESTIC_COMPETITION_CODE);
  const competitionName = getDomesticCompetitionName(competitionCode);

  const { currentSeason, defaultSeason } = await resolveTasoSeasonContext(competitionCode);
  const selectableSeasons = listSelectableTasoSeasons(
    currentSeason,
    earliestSeasonFor(competitionCode)
  );
  const season = parseTasoSeasonParam(params.kausi, selectableSeasons);
  // A team's own season only stands in for a missing one. An invalid `kausi`
  // keeps its notice and the competition's default, as it always has.
  const seasonFallback =
    defaults !== undefined && defaults.competitionCode === competitionCode
      ? defaults.seasonId
      : defaultSeason;
  const seasonId = season.kind === "valid" ? season.seasonId : seasonFallback;
  const seasonLabel = String(seasonId);
  const competitionId = competitionIdForSeason(competitionCode, seasonId);
  const categoryId = categoryIdForSeason(competitionCode, seasonId);
  const publishedName = await getSeasonCategoryName(
    categoryId,
    competitionId,
    seasonId,
    currentSeason
  );
  const seasonCompetitionName = publishedName ?? competitionName;
  const renamedTo =
    publishedName !== null && publishedName !== competitionName ? competitionName : null;

  return {
    currentSeason,
    competitionCode,
    competitionParam,
    competitionName,
    selectableSeasons,
    season,
    seasonId,
    seasonLabel,
    competitionId,
    categoryId,
    seasonCompetitionName,
    renamedTo,
  };
}
