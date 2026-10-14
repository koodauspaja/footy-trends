import { preferredCompetitionFor } from "@/lib/competition-preferences";
import { getViewerPreferences } from "@/lib/viewer";
import {
  categoryIdForSeason,
  competitionIdForSeason,
  DEFAULT_DOMESTIC_COMPETITION_CODE,
  type DomesticCompetitionParamResult,
  earliestSeasonFor,
  getDomesticCompetitionName,
  parseDomesticCompetitionParam,
} from "./domestic-competitions";
import { parseWholeNumber } from "./provider-ids";
import type { SeasonOption, SeasonParamResult } from "./seasons";
import { getSeasonCategoryName, resolveTasoSeasonContext } from "./taso-standings-service";
import type { TeamContext } from "./team-context";

/**
 * The seasons a Finnish competition offers, as calendar years, newest first.
 * The floor is per competition, not provider-wide.
 *
 * decisions/009-veikkausliiga.md
 * decisions/013-more-finnish-competitions.md
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
 * Validates the `kausi` query parameter against the selectable range, whose
 * upper end is discovered, not fixed.
 *
 * decisions/009-veikkausliiga.md
 * decisions/011-current-season-discovery.md
 */
export function parseTasoSeasonParam(
  rawValue: string | string[] | undefined,
  selectable: SeasonOption[]
): SeasonParamResult {
  if (rawValue === undefined) return { kind: "absent" };
  const seasonId = parseWholeNumber(rawValue);
  if (seasonId === null) return { kind: "invalid" };

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
 * page's `generateMetadata` and page component. There is no `"error"` status:
 * a failed discovery falls back inside `resolveTasoSeasonContext`.
 *
 * decisions/009-veikkausliiga.md
 * decisions/011-current-season-discovery.md
 * decisions/020-context-free-team-page.md
 * decisions/024-account-settings.md
 */
export async function resolveDomesticPageContext(
  params: Record<string, string | string[] | undefined>,
  /**
   * What to use where the URL says nothing: a team's own newest stored context,
   * on the pages that have one. Omitted everywhere else.
   */
  defaults?: TeamContext
): Promise<DomesticPageContext> {
  const competitionParam = parseDomesticCompetitionParam(params.kilpailu);
  const competitionCode =
    competitionParam.kind === "valid"
      ? competitionParam.code
      : (defaults?.competitionCode ??
        // Only reached when neither the URL nor a team context has settled it.
        preferredCompetitionFor("kotimaa", await getViewerPreferences()) ??
        DEFAULT_DOMESTIC_COMPETITION_CODE);
  const competitionName = getDomesticCompetitionName(competitionCode);

  const { currentSeason, defaultSeason } = await resolveTasoSeasonContext(competitionCode);
  const selectableSeasons = listSelectableTasoSeasons(
    currentSeason,
    earliestSeasonFor(competitionCode)
  );
  const season = parseTasoSeasonParam(params.kausi, selectableSeasons);
  // A team's own season stands in wherever `kausi` does not decide. An invalid
  // one still gets its notice, and falls back to the team's season only when
  // the resolved competition is the one being shown.
  const seasonFallback =
    (defaults?.competitionCode === competitionCode ? defaults?.seasonId : undefined) ??
    defaultSeason;
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
