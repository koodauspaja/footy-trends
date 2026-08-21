import {
  DEFAULT_KOTIMAA_COMPETITION_CODE,
  getKotimaaCompetitionName,
  type KotimaaCompetitionParamResult,
  parseKotimaaCompetitionParam,
} from "./kotimaa-competitions";
import type { SeasonOption, SeasonParamResult } from "./seasons";
import { competitionIdFromSeason, EARLIEST_TASO_SEASON, LATEST_TASO_SEASON } from "./taso";

/**
 * Veikkausliiga's season is a single calendar year, not a year-spanning one
 * like the foreign leagues — the label is just the year. Descending,
 * newest first, same convention as `listSelectableSeasons`.
 */
export function listSelectableTasoSeasons(): SeasonOption[] {
  const options: SeasonOption[] = [];
  for (let year = LATEST_TASO_SEASON; year >= EARLIEST_TASO_SEASON; year -= 1) {
    options.push({ seasonId: year, label: String(year) });
  }
  return options;
}

/**
 * Validates the `kausi` query parameter against the fixed 2015–2026 range —
 * no live provider call needed (unlike `parseSeasonParam` for
 * football-data.org), since the range is static.
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
 * analogue of `resolveBasePageContext`, but synchronous: the season range is
 * a fixed 2015–2026, not fetched from a provider, so there is no `"error"`
 * status to handle here.
 */
export function resolveKotimaaPageContext(
  params: Record<string, string | string[] | undefined>
): KotimaaPageContext {
  const competitionParam = parseKotimaaCompetitionParam(params.kilpailu);
  const competitionCode =
    competitionParam.kind === "valid" ? competitionParam.code : DEFAULT_KOTIMAA_COMPETITION_CODE;
  const competitionName = getKotimaaCompetitionName(competitionCode);

  const selectableSeasons = listSelectableTasoSeasons();
  const season = parseTasoSeasonParam(params.kausi, selectableSeasons);
  const seasonId = season.kind === "valid" ? season.seasonId : LATEST_TASO_SEASON;
  const seasonLabel = String(seasonId);
  const competitionId = competitionIdFromSeason(seasonId);

  return {
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
