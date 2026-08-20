import {
  type CompetitionParamResult,
  DEFAULT_COMPETITION_CODE,
  getCompetitionName,
  parseCompetitionParam,
} from "@/lib/competitions";
import { getSeasonContext, type SeasonContext } from "@/lib/football-data";
import { logger } from "@/lib/logger";
import { formatSeasonLabel, parseSeasonParam, type SeasonParamResult } from "@/lib/seasons";

export type BasePageContext =
  | { status: "error"; competitionName: string }
  | {
      status: "ok";
      competitionCode: string;
      competitionParam: CompetitionParamResult;
      competitionName: string;
      context: SeasonContext;
      season: SeasonParamResult;
      seasonId: number;
      seasonLabel: string;
    };

async function resolveSeasonContext(competitionCode: string): Promise<SeasonContext | null> {
  try {
    return await getSeasonContext(competitionCode);
  } catch (error) {
    logger.error({ err: error, competitionCode }, "Unable to resolve the selectable seasons");
    return null;
  }
}

/**
 * Resolves the competition and season context shared by every `kilpailu`/
 * `kausi`-keyed page's `generateMetadata` and page component. Called once
 * from each (Next.js invokes them separately), but `getSeasonContext` is
 * wrapped in React's `cache()`, so the underlying fetch only happens once
 * per request regardless.
 */
export async function resolveBasePageContext(
  params: Record<string, string | string[] | undefined>
): Promise<BasePageContext> {
  const competitionParam = parseCompetitionParam(params.kilpailu);
  const competitionCode =
    competitionParam.kind === "valid" ? competitionParam.code : DEFAULT_COMPETITION_CODE;
  const competitionName = getCompetitionName(competitionCode);

  const context = await resolveSeasonContext(competitionCode);
  if (context === null) return { status: "error", competitionName };

  const season = parseSeasonParam(params.kausi, context.selectableSeasons);
  const seasonId = season.kind === "valid" ? season.seasonId : context.activeSeasonId;
  const seasonLabel = formatSeasonLabel(seasonId);

  return {
    status: "ok",
    competitionCode,
    competitionParam,
    competitionName,
    context,
    season,
    seasonId,
    seasonLabel,
  };
}
