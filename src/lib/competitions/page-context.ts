import { getViewerPreferences } from "@/lib/auth/viewer";
import {
  type CompetitionParamResult,
  type CompetitionRegion,
  defaultCompetitionFor,
  getCompetitionName,
  parseCompetitionParam,
} from "@/lib/competitions/competitions";
import {
  formatSeasonLabel,
  parseSeasonParam,
  type SeasonParamResult,
  withNoMatches,
} from "@/lib/competitions/seasons";
import { getSeasonContext, type SeasonContext } from "@/lib/football-data/football-data";
import { storedForeignSeasons } from "@/lib/football-data/standings-service";
import { logger } from "@/lib/platform/logger";
import { preferredCompetitionFor } from "@/lib/preferences/competition-preferences";
import type { TeamContext } from "@/lib/teams/team-context";

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

/**
 * A foreign league's upcoming season, marked as having no matches until its
 * fixtures are stored: read from the database, never asked of the provider.
 *
 * decisions/878-empty-season-not-selectable.md
 */
async function withUpcomingMarked(
  competitionCode: string,
  context: SeasonContext
): Promise<SeasonContext> {
  const upcoming = context.upcomingSeasonId;
  if (upcoming === undefined || (await storedForeignSeasons(competitionCode)).has(upcoming)) {
    return context;
  }
  return { ...context, selectableSeasons: withNoMatches(context.selectableSeasons, upcoming) };
}

async function resolveSeasonContext(
  competitionCode: string,
  region: CompetitionRegion
): Promise<SeasonContext | null> {
  try {
    const context = await getSeasonContext(competitionCode);
    // The national-team tournaments keep their selector as it is.
    return region === "foreign" ? await withUpcomingMarked(competitionCode, context) : context;
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

  const context = await resolveSeasonContext(competitionCode, region);
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
