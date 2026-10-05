import type { Metadata } from "next";
import { ContextNotices } from "@/components/context-notices";
import { RenamedNotice } from "@/components/renamed-notice";
import { TasoSeasonOnlyControls } from "@/components/taso-season-only-controls";
import {
  resolveTeamIdentity,
  TEAM_HEADING,
  TeamPage,
  type TeamPageData,
  teamPageMetadata,
} from "@/components/team-page";
import {
  earliestSeasonFor,
  getDomesticCompetitionName,
  isDomesticCup,
  parseDomesticCompetitionParam,
} from "@/lib/domestic-competitions";
import { resolveDomesticPageContext } from "@/lib/domestic-page-context";
import { getTeamElo } from "@/lib/elo-service";
import { getWorstOpponents } from "@/lib/match-service";
import { parseWholeNumber } from "@/lib/provider-ids";
import {
  getTeamMatches,
  getTeamPanelMatches,
  getTeamPositionSeries,
  getTeamSeasonComparison,
  getTeamStreakRecords,
  type TeamMatchesResult,
} from "@/lib/taso-standings-service";
import type { TeamContextFilter, TeamPageSource } from "@/lib/team-context";
import { resolveTeamDefaults, seasonCandidate } from "@/lib/team-page-context";
import { teamPanelLoaders } from "@/lib/team-panels";

export const dynamic = "force-dynamic";

const SOURCE: TeamPageSource = { kind: "taso", bucket: "domestic" };
const BASE_PATH = "/kotimaa";

type DomesticTeamPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type TasoMatch = Extract<TeamMatchesResult, { status: "ok" }>["matches"][number];

/** What the URL already said, and so what the team's own context must not contradict. */
function filterFrom(params: Record<string, string | string[] | undefined>): TeamContextFilter {
  const competitionParam = parseDomesticCompetitionParam(params.kilpailu);
  const season = seasonCandidate(params.kausi);
  return {
    ...(competitionParam.kind === "valid" ? { competitionCode: competitionParam.code } : {}),
    ...(season === undefined ? {} : { seasonId: season }),
  };
}

/**
 * A Finnish club's page, as the shared `TeamPage` takes it (#530). This file
 * was a copy of that page until then; what is left here is what TASO does
 * differently: its own context resolver, a season that is a plain year, the
 * renamed-competition notice, the `Sarja` column, and loaders that take a
 * category and a competition id where football-data takes a competition code.
 *
 * The team's own context is resolved *before* the season context, because it
 * decides which competition that context is fetched for. Both calls are
 * `cache()`d, so Next.js invoking the metadata and the page separately costs
 * one of each. See specs/020-context-free-team-page.md.
 */
async function resolveTeamPage({
  params,
  searchParams,
}: DomesticTeamPageProps): Promise<TeamPageData<TasoMatch>> {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const teamProviderId = parseWholeNumber(id);
  if (teamProviderId === null) return { status: "not_found" };
  const defaults = await resolveTeamDefaults(SOURCE, teamProviderId, filterFrom(query));
  if (defaults.status === "not_found") return defaults;
  // No competition could be resolved, so the page is headed as a team page.
  if (defaults.status === "error") return { status: "error", heading: TEAM_HEADING };

  const context = await resolveDomesticPageContext(query, defaults.defaults);
  const {
    categoryId,
    competitionId,
    competitionCode,
    competitionParam,
    competitionName,
    currentSeason,
    season,
    seasonId,
    seasonLabel,
  } = context;
  const result = await getTeamMatches(
    categoryId,
    competitionId,
    teamProviderId,
    seasonId,
    currentSeason
  );
  const [firstMatch] = result.status === "ok" ? result.matches : [];
  const { name, seasons } = await resolveTeamIdentity(SOURCE, teamProviderId, firstMatch);

  return {
    status: "ok",
    teamProviderId,
    basePath: BASE_PATH,
    favouriteSource: "taso",
    competitionCode,
    // The season's own name, which a renamed competition's older seasons keep.
    headingCompetition: context.seasonCompetitionName,
    seasonId,
    seasonLabel,
    result,
    teamName: name.status === "ok" ? name.name : null,
    nameStatus: name.status,
    seasons,
    lead: <RenamedNotice renamedTo={context.renamedTo} />,
    notices: (
      <ContextNotices resolved={{ competitionParam, competitionName, season, seasonLabel }} />
    ),
    names: {
      season: String,
      competition: getDomesticCompetitionName,
      selectable: (code, year) => year >= earliestSeasonFor(code) && year <= currentSeason,
    },
    controls: ({ offeredSeasons, seasonCompetitions }) => (
      <TasoSeasonOnlyControls
        actionPath={`${BASE_PATH}/joukkue/${teamProviderId}`}
        competitionCode={competitionCode}
        seasonCompetitions={seasonCompetitions}
        seasons={offeredSeasons}
        selectedSeasonId={seasonId}
      />
    ),
    fourthColumn: { header: "Sarja", render: (match) => match.groupName },
    loaders: (played) => ({
      // The same season wording the selector above the panel uses, so a
      // record names a season the way the rest of the page does.
      loadRecords: () =>
        getTeamStreakRecords(competitionCode, teamProviderId, currentSeason, played, String),
      // By competition code, not by TASO category: the comparison reads many
      // seasons, and a category id belongs to one (specs/038).
      loadComparison: () =>
        getTeamSeasonComparison(competitionCode, teamProviderId, seasonId, currentSeason, played),
      // A cup has no table to rank a position in, so the panel is absent
      // rather than empty (specs/040, S2). League competitions only
      // (specs/030 and specs/031, Q2).
      loadPosition: () =>
        isDomesticCup(competitionCode)
          ? Promise.resolve({ status: "unavailable" as const })
          : getTeamPositionSeries(
              categoryId,
              competitionId,
              teamProviderId,
              seasonId,
              currentSeason
            ),
      // The six result panels, over one read of the season's matches.
      ...teamPanelLoaders(teamProviderId, () =>
        getTeamPanelMatches(categoryId, competitionId, teamProviderId, seasonId, currentSeason)
      ),
      // Every competition in /kotimaa and every stored season, whatever
      // season is shown (specs/045, S4).
      loadOpponents: () => getWorstOpponents(SOURCE, teamProviderId, BASE_PATH),
      // A club's strength across every stored season (specs/053 S9).
      loadElo: async () => ({
        series: await getTeamElo("taso", teamProviderId),
        seasonLabel: String,
      }),
    }),
  };
}

export async function generateMetadata(props: DomesticTeamPageProps): Promise<Metadata> {
  return teamPageMetadata(await resolveTeamPage(props));
}

export default async function DomesticTeamPage(props: Readonly<DomesticTeamPageProps>) {
  return TeamPage({ data: await resolveTeamPage(props) });
}
