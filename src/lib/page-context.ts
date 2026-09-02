import {
  type CompetitionParamResult,
  type CompetitionRegion,
  defaultCompetitionFor,
  getCompetitionName,
  parseCompetitionParam,
} from "@/lib/competitions";
import { getSeasonContext, type SeasonContext } from "@/lib/football-data";
import { logger } from "@/lib/logger";
import { formatSeasonLabel, parseSeasonParam, type SeasonParamResult } from "@/lib/seasons";
import type { TeamContext } from "@/lib/team-context";

/**
 * What a route file supplies to make a shared page one region's.
 *
 * `/ulkomaat` and `/maajoukkueet` render the same pages and differ only in the
 * competitions they offer and the prefix on their links, so the pages take
 * both as arguments rather than existing twice. See
 * specs/016-world-cup-and-euro.md.
 */
export type CompetitionPageOptions = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | undefined;
  /** Which competitions the page offers, and what `kilpailu` is validated against. */
  region: CompetitionRegion;
  /** The Finnish URL prefix every link and form action on the page uses. */
  basePath: string;
  /**
   * Whether the page offers a `Kilpailu` select.
   *
   * `/ulkomaat`'s competitions are interchangeable views of the same kind of
   * thing, so switching between them mid-page is useful. The World Cup and the
   * European Championship are not: they are separate tournaments reached from
   * the region picker, and a dropdown between them reads as if one were a
   * variant of the other.
   */
  showCompetitionSelect: boolean;
};

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
  params: Record<string, string | string[] | undefined>,
  region: CompetitionRegion,
  /**
   * What to use where the URL says nothing — a team's own newest stored
   * context, on the pages that have one. Omitted everywhere else, which leaves
   * the region's defaults exactly as they were. See
   * specs/020-context-free-team-page.md.
   */
  defaults?: TeamContext
): Promise<BasePageContext> {
  const competitionParam = parseCompetitionParam(params.kilpailu, region);
  const competitionCode =
    competitionParam.kind === "valid"
      ? competitionParam.code
      : (defaults?.competitionCode ?? defaultCompetitionFor(region));
  const competitionName = getCompetitionName(competitionCode);

  const context = await resolveSeasonContext(competitionCode);
  if (context === null) return { status: "error", competitionName };

  const season = parseSeasonParam(params.kausi, context.selectableSeasons);
  // As in the domestic resolver: a team's own season fills a gap, it does not
  // override an invalid value's fallback.
  const seasonFallback =
    defaults !== undefined && defaults.competitionCode === competitionCode
      ? defaults.seasonId
      : context.activeSeasonId;
  const seasonId = season.kind === "valid" ? season.seasonId : seasonFallback;
  const seasonLabel = formatSeasonLabel(seasonId, context.spansCalendarYears);

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
