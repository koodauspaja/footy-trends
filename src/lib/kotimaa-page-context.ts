import {
  DEFAULT_KOTIMAA_COMPETITION_CODE,
  getKotimaaCompetitionName,
  type KotimaaCompetitionParamResult,
  parseKotimaaCompetitionParam,
} from "./kotimaa-competitions";
import type { SeasonOption, SeasonParamResult } from "./seasons";
import { competitionIdFromSeason, EARLIEST_TASO_SEASON } from "./taso";
import { resolveTasoSeasonContext } from "./taso-standings-service";

/**
 * Veikkausliiga's season is a single calendar year, not a year-spanning one
 * like the foreign leagues — the label is just the year. Descending,
 * newest first, same convention as `listSelectableSeasons`.
 */
export function listSelectableTasoSeasons(currentSeason: number): SeasonOption[] {
  const options: SeasonOption[] = [];
  for (let year = currentSeason; year >= EARLIEST_TASO_SEASON; year -= 1) {
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

export type KotimaaPageContext = {
  /** The discovered season: the selector ceiling, and what `needsRefresh` treats as current. */
  currentSeason: number;
  competitionCode: string;
  competitionParam: KotimaaCompetitionParamResult;
  competitionName: string;
  selectableSeasons: SeasonOption[];
  season: SeasonParamResult;
  seasonId: number;
  seasonLabel: string;
  competitionId: string;
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
export async function resolveKotimaaPageContext(
  params: Record<string, string | string[] | undefined>
): Promise<KotimaaPageContext> {
  const competitionParam = parseKotimaaCompetitionParam(params.kilpailu);
  const competitionCode =
    competitionParam.kind === "valid" ? competitionParam.code : DEFAULT_KOTIMAA_COMPETITION_CODE;
  const competitionName = getKotimaaCompetitionName(competitionCode);

  const { currentSeason, defaultSeason } = await resolveTasoSeasonContext();
  const selectableSeasons = listSelectableTasoSeasons(currentSeason);
  const season = parseTasoSeasonParam(params.kausi, selectableSeasons);
  const seasonId = season.kind === "valid" ? season.seasonId : defaultSeason;
  const seasonLabel = String(seasonId);
  const competitionId = competitionIdFromSeason(seasonId);

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
  };
}
