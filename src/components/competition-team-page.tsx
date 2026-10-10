import type { Metadata } from "next";
import { ContextNotices } from "@/components/context-notices";
import {
  resolveTeamIdentity,
  TEAM_HEADING,
  TeamPage,
  type TeamPageData,
  teamPageMetadata,
} from "@/components/team-page";
import { TeamSeasonSelector } from "@/components/team-season-selector";
import {
  earliestSeasonFor,
  getCompetitionFormat,
  getCompetitionName,
  parseCompetitionParam,
} from "@/lib/competitions";
import { toFinnishCountryName, toFinnishTeamNames } from "@/lib/country-names";
import { getTeamElo } from "@/lib/elo-service";
import type { NormalizedProviderMatch } from "@/lib/football-data";
import { getWorstOpponents } from "@/lib/match-service";
import { type CompetitionPageOptions, resolveBasePageContext } from "@/lib/page-context";
import { parseWholeNumber } from "@/lib/provider-ids";
import { formatSeasonLabel, resolveEarliestSeason } from "@/lib/seasons";
import {
  getTeamMatches,
  getTeamPanelMatches,
  getTeamPositionSeries,
  getTeamSeasonComparison,
  getTeamStreakRecords,
} from "@/lib/standings-service";
import type { TeamContextFilter } from "@/lib/team-context";
import { resolveTeamDefaults, seasonCandidate } from "@/lib/team-page-context";
import { teamPanelLoaders } from "@/lib/team-panels";

/**
 * A team page's own `params`, on top of the shared region options.
 *
 * decisions/016-world-cup-and-euro.md
 */
export type CompetitionTeamPageOptions = CompetitionPageOptions & {
  params: Promise<{ id: string }>;
};

/**
 * What the URL already said, and so what the team's own context must not contradict.
 *
 * decisions/020-context-free-team-page.md
 */
function filterFrom(
  params: Record<string, string | string[] | undefined>,
  region: CompetitionPageOptions["region"]
): TeamContextFilter {
  const competitionParam = parseCompetitionParam(params.kilpailu, region);
  const season = seasonCandidate(params.kausi);
  return {
    ...(competitionParam.kind === "valid" ? { competitionCode: competitionParam.code } : {}),
    ...(season === undefined ? {} : { seasonId: season }),
  };
}

/**
 * A football-data team's page as `TeamPage` takes it. Next calls it for the
 * metadata and the page alike; the reads beneath are `cache()`d per request.
 *
 * decisions/004-listing-matches-for-selected-team.md
 * decisions/020-context-free-team-page.md
 * decisions/040-cup-analytics.md
 * decisions/045-bogey-teams.md
 * decisions/053-elo-ratings.md
 */
async function resolveTeamPage({
  params,
  searchParams,
  region,
  basePath,
}: CompetitionTeamPageOptions): Promise<TeamPageData<NormalizedProviderMatch>> {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const teamProviderId = parseWholeNumber(id);
  if (teamProviderId === null) return { status: "not_found" };
  const source = { kind: "football-data", region } as const;
  // Resolved before the season context, because it decides which competition
  // that context is fetched for.
  const defaults = await resolveTeamDefaults(source, teamProviderId, filterFrom(query, region));
  if (defaults.status === "not_found") return defaults;
  if (defaults.status === "error") return { status: "error", heading: TEAM_HEADING };

  const base = await resolveBasePageContext(query, region, defaults.defaults);
  if (base.status === "error") return { status: "error", heading: base.competitionName };
  const { competitionCode, competitionParam, competitionName, context, season, seasonId } = base;
  const { seasonLabel } = base;

  const result = await getTeamMatches(
    competitionCode,
    teamProviderId,
    seasonId,
    context.activeSeasonId
  );

  // A national team is a country, and this app is Finnish.
  const localised =
    result.status === "ok" && region === "national-teams"
      ? ({ ...result, matches: toFinnishTeamNames(result.matches) } as typeof result)
      : result;

  const [firstMatch] = localised.status === "ok" ? localised.matches : [];
  const { name, seasons } = await resolveTeamIdentity(source, teamProviderId, firstMatch);
  const storedName = name.status === "ok" ? name.name : null;
  // A national team is a country, and this app is Finnish — the same treatment
  // `localised` gives the match list, applied to a name read straight from the
  // database. Without it this page alone says "England".
  const teamName =
    storedName !== null && region === "national-teams"
      ? toFinnishCountryName(storedName)
      : storedName;

  const labelSeason = (year: number) => formatSeasonLabel(year, context.spansCalendarYears);

  return {
    status: "ok",
    teamProviderId,
    basePath,
    favouriteSource: "football-data",
    competitionCode,
    headingCompetition: competitionName,
    seasonId,
    seasonLabel,
    result: localised,
    teamName,
    nameStatus: name.status,
    seasons,
    lead: null,
    notices: (
      <ContextNotices resolved={{ competitionParam, competitionName, season, seasonLabel }} />
    ),
    names: {
      season: labelSeason,
      competition: getCompetitionName,
      selectable: (code, year) =>
        year >=
          earliestSeasonFor(
            code,
            resolveEarliestSeason(process.env.FOOTBALL_DATA_EARLIEST_SEASON)
          ) && year <= context.activeSeasonId,
    },
    controls: ({ offeredSeasons, seasonCompetitions }) => (
      <TeamSeasonSelector
        basePath={basePath}
        competitionCode={competitionCode}
        seasonCompetitions={seasonCompetitions}
        seasons={offeredSeasons}
        selectedSeasonId={seasonId}
        teamProviderId={teamProviderId}
      />
    ),
    fourthColumn: { header: "Kierros", render: (match) => match.matchday ?? "" },
    loaders: (played) => ({
      // The same season wording the selector above the panel uses, so a
      // record names a season the way the rest of the page does.
      loadRecords: () =>
        getTeamStreakRecords(
          competitionCode,
          teamProviderId,
          context.activeSeasonId,
          played,
          labelSeason
        ),
      loadComparison: () =>
        getTeamSeasonComparison(
          competitionCode,
          teamProviderId,
          seasonId,
          context.activeSeasonId,
          played
        ),
      // A cup has no table to rank a position in, so the panel is absent, not
      // empty. Every other panel is computed from results, which a cup has.
      loadPosition: () =>
        getCompetitionFormat(competitionCode) === "cup"
          ? Promise.resolve({ status: "unavailable" as const })
          : getTeamPositionSeries(
              competitionCode,
              teamProviderId,
              seasonId,
              context.activeSeasonId
            ),
      // The six result panels, over one read of the season's matches.
      ...teamPanelLoaders({ teamProviderId, competitionCode, seasonId }, () =>
        getTeamPanelMatches(competitionCode, teamProviderId, seasonId, context.activeSeasonId)
      ),
      // Every competition in the region and every stored season, whatever season
      // is shown. `unavailable` on a national team's page: a country, not a club.
      loadOpponents: () => getWorstOpponents(source, teamProviderId, basePath),
      // Clubs only: national teams have no Elo.
      loadElo: async () =>
        region === "national-teams"
          ? { series: { status: "unavailable" as const } }
          : {
              series: await getTeamElo("football-data", teamProviderId),
              seasonLabel: labelSeason,
            },
    }),
  };
}

export async function teamMetadata(options: CompetitionTeamPageOptions): Promise<Metadata> {
  return teamPageMetadata(await resolveTeamPage(options));
}

/**
 * A team's page for one region, `/ulkomaat` or `/maajoukkueet`. One
 * implementation for both.
 *
 * decisions/016-world-cup-and-euro.md
 */
export async function CompetitionTeamPage(options: Readonly<CompetitionTeamPageOptions>) {
  return TeamPage({ data: await resolveTeamPage(options) });
}
