import { preferredCompetitionFor } from "@/lib/competition-preferences";
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
import { getViewerPreferences } from "@/lib/viewer";

/**
 * What a route file supplies to make a shared page one region's: the
 * competitions it offers and the prefix on its links.
 *
 * decisions/016-world-cup-and-euro.md
 */
export type CompetitionPageOptions = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | undefined;
  /** Which competitions the page offers, and what `kilpailu` is validated against. */
  region: CompetitionRegion;
  /** The Finnish URL prefix every link and form action on the page uses. */
  basePath: string;
  /** Whether the page offers a `Kilpailu` select. */
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
 * `kausi`-keyed page's `generateMetadata` and page component.
 *
 * decisions/007-back-navigation.md
 * decisions/012-finnish-urls-english-code.md
 * decisions/020-context-free-team-page.md
 * decisions/024-account-settings.md
 */
export async function resolveBasePageContext(
  params: Record<string, string | string[] | undefined>,
  region: CompetitionRegion,
  /**
   * What to use where the URL says nothing: a team's own newest stored context,
   * on the pages that have one. Omitted everywhere else.
   */
  defaults?: TeamContext
): Promise<BasePageContext> {
  const competitionParam = parseCompetitionParam(params.kilpailu, region);
  // Precedence, most specific first: the URL, the team's own context on the
  // pages that have one, the reader's stored preference, the region's default.
  const explicit =
    competitionParam.kind === "valid" ? competitionParam.code : defaults?.competitionCode;
  const competitionCode =
    explicit ??
    // Only reached when neither the URL nor a team context has settled it —
    // otherwise every signed-in request would pay for an auth and Postgres
    // lookup whose answer could not change the outcome.
    preferredCompetitionFor(
      region === "foreign" ? "ulkomaat" : "maajoukkueet",
      await getViewerPreferences()
    ) ??
    defaultCompetitionFor(region);
  const competitionName = getCompetitionName(competitionCode);

  const context = await resolveSeasonContext(competitionCode);
  if (context === null) return { status: "error", competitionName };

  const season = parseSeasonParam(params.kausi, context.selectableSeasons);
  // As in the domestic resolver: the team's own season stands in wherever
  // `kausi` does not decide, and an invalid one keeps its notice either way.
  const seasonFallback =
    (defaults?.competitionCode === competitionCode ? defaults?.seasonId : undefined) ??
    context.activeSeasonId;
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
