import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AnalyticsSection } from "@/components/analytics-section";
import type { EloPanelData } from "@/components/elo-section";
import { FavouriteToggle } from "@/components/favourite-toggle";
import { type MatchListRow, MatchListTable } from "@/components/match-list-table";
import { PageShell } from "@/components/page-shell";
import { TeamMatchesOutcome } from "@/components/team-matches-outcome";
import { MATCHES_HEADING, TeamPageFold } from "@/components/team-page-fold";
import { SEASON_AXIS } from "@/lib/analytics-axis";
import type { FavouriteSource } from "@/lib/favourite-keys";
import type { OpponentsSeries } from "@/lib/head-to-head";
import { matchCountLabel } from "@/lib/national-team";
import type { PositionSeries } from "@/lib/position-series";
import type { SeasonComparisonSeries } from "@/lib/season-comparison";
import type { StreakRecordsSeries } from "@/lib/streak-records";
import type { TeamPageSource } from "@/lib/team-context";
import type { TeamPanelLoaders } from "@/lib/team-panels";
import {
  getTeamName,
  getTeamSeasons,
  type TeamNameResult,
  type TeamSeason,
  type TeamSeasonsResult,
  type TeamSeasonsView,
  teamSeasonsView,
} from "@/lib/team-seasons";

/**
 * A club's page, whichever provider its matches come from (#530).
 *
 * `/ulkomaat` and `/maajoukkueet` shared one implementation and `/kotimaa` had
 * a copy of it, which is how the favourite star came to be missing from Finnish
 * clubs alone (#526). There is one page now. What differs between providers
 * comes in as `TeamPageView`: the names, the notices, the controls, one table
 * column and the analytics loaders. Each provider resolves its own view,
 * `competition-team-page.tsx` for football-data and the `/kotimaa` route for
 * TASO, and nothing below knows which it was given.
 */
export const TEAM_HEADING = "Joukkue";
const NOT_FOUND_MESSAGE = "Joukkuetta ei löytynyt.";
const ERROR_MESSAGE = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";

/** The panels a provider builds for itself. The page adds the axis and the outage guard. */
export type TeamAnalyticsLoaders = TeamPanelLoaders & {
  loadPosition: () => Promise<PositionSeries>;
  loadRecords: () => Promise<StreakRecordsSeries>;
  loadComparison: () => Promise<SeasonComparisonSeries>;
  loadOpponents: () => Promise<OpponentsSeries>;
  loadElo: () => Promise<EloPanelData>;
};

/** Everything provider-specific about a team page that has a team to show. */
export type TeamPageView<M extends MatchListRow> = {
  status: "ok";
  teamProviderId: number;
  /** The region's Finnish prefix, e.g. `/kotimaa`: every link on the page is under it. */
  basePath: string;
  /** Which provider's id the favourite star stores (specs/026-favourites.md). */
  favouriteSource: FavouriteSource;
  competitionCode: string;
  /** The competition as the heading and the tab title name it. */
  headingCompetition: string;
  seasonId: number;
  seasonLabel: string;
  result: { status: "ok"; matches: M[] } | { status: "not_found" | "empty" | "error" };
  teamName: string | null;
  /** Whether the name lookup itself failed, which is an outage like any other. */
  nameStatus: TeamNameResult["status"];
  /** Every competition and season this club has matches for. */
  seasons: TeamSeasonsResult;
  /** Above the standings link. Only TASO has one: its renamed-competition notice. */
  lead: ReactNode;
  /** The notices for a competition or season the URL got wrong. */
  notices: ReactNode;
  /** How this provider words a season and a competition, and which it offers. */
  names: {
    season: (seasonId: number) => string;
    competition: (competitionCode: string) => string;
    selectable: (competitionCode: string, seasonId: number) => boolean;
  };
  /** The season selector, which each provider builds from its own component. */
  controls: (offered: Pick<TeamSeasonsView, "offeredSeasons" | "seasonCompetitions">) => ReactNode;
  /** The match list's last column: a round, or TASO's group. */
  fourthColumn: { header: string; render: (match: M) => ReactNode };
  /** The analytics loaders, given the seasons the club has played. */
  loaders: (played: TeamSeason[]) => TeamAnalyticsLoaders;
};

export type TeamPageData<M extends MatchListRow> =
  /** No stored match anywhere under this route — not "none this season". */
  | { status: "not_found" }
  /** The page could not be resolved. The heading is what there is to head it with. */
  | { status: "error"; heading: string }
  | TeamPageView<M>;

/** Which side of the match this team played, so its own name can be read off it. */
function nameForTeam(
  match: { homeTeamProviderId: number; homeTeamName: string; awayTeamName: string },
  teamProviderId: number
): string {
  return match.homeTeamProviderId === teamProviderId ? match.homeTeamName : match.awayTeamName;
}

/**
 * The club's own name and its seasons, which every provider's page needs.
 *
 * The name is asked for only when there is no match to read it off.
 */
export async function resolveTeamIdentity(
  source: TeamPageSource,
  teamProviderId: number,
  firstMatch: Parameters<typeof nameForTeam>[0] | undefined
): Promise<{ name: TeamNameResult; seasons: TeamSeasonsResult }> {
  // Neither lookup needs the other, so they are asked together.
  const [seasons, name] = await Promise.all([
    getTeamSeasons(source, teamProviderId),
    firstMatch === undefined
      ? getTeamName(source, teamProviderId)
      : ({ status: "ok", name: nameForTeam(firstMatch, teamProviderId) } satisfies TeamNameResult),
  ]);
  return { name, seasons };
}

function headingOf(
  view: Pick<TeamPageView<MatchListRow>, "teamName" | "headingCompetition" | "seasonLabel">
): string {
  return view.teamName !== null
    ? `${view.teamName} – ${view.headingCompetition} ${view.seasonLabel}`
    : view.headingCompetition;
}

/** The tab title: the page's own heading, or what stands in for one. */
export function teamPageMetadata<M extends MatchListRow>(data: TeamPageData<M>): Metadata {
  if (data.status === "not_found") return { title: NOT_FOUND_MESSAGE };
  if (data.status === "error") return { title: data.heading };
  return { title: headingOf(data) };
}

export async function TeamPage<M extends MatchListRow>({
  data,
}: Readonly<{ data: TeamPageData<M> }>) {
  // A team with no stored match has no competition to name, so the page offers
  // neither a season selector nor a standings link: every season would fail
  // identically, and the table would be one this team never played in.
  if (data.status === "not_found") {
    return (
      <PageShell heading={TEAM_HEADING}>
        <p>{NOT_FOUND_MESSAGE}</p>
      </PageShell>
    );
  }
  if (data.status === "error") {
    return (
      <PageShell heading={data.heading}>
        <p>{ERROR_MESSAGE}</p>
      </PageShell>
    );
  }

  const {
    teamProviderId,
    basePath,
    competitionCode,
    seasonId,
    seasonLabel,
    result,
    teamName,
    nameStatus,
    seasons,
    names,
  } = data;

  /**
   * The toggle names the club rather than the heading, because the heading
   * carries the competition and the season too — and a favourite follows the
   * club across both (specs/022, specs/026-favourites.md).
   *
   * Nothing renders when the name is unknown: a favourite whose label cannot be
   * resolved would be a star with nothing to say what it is following.
   */
  const favourite =
    teamName === null ? null : (
      <FavouriteToggle
        kind="team"
        name={teamName}
        source={data.favouriteSource}
        teamProviderId={teamProviderId}
      />
    );

  const played = seasons.status === "ok" ? seasons.seasons : [];
  // Either lookup failing is an outage, and neither is a club that does not exist.
  const lookups = nameStatus === "error" ? "error" : seasons.status;

  const { offeredSeasons, seasonCompetitions, sameSeason, newest } = teamSeasonsView(
    played,
    seasonId,
    {
      ...names,
      href: (code, year) => `${basePath}/joukkue/${teamProviderId}?kilpailu=${code}&kausi=${year}`,
    }
  );
  // Everything the body needs, in one value: the two lookups' verdicts and
  // where the club was instead.
  const outcome = { result: result.status, seasons: lookups, seasonLabel, sameSeason, newest };

  /**
   * Every competition, league or cup (specs/040): every panel but the position
   * chart is computed from results, which a cup has, and that one decides in
   * its own loader whether there is a table to rank in.
   *
   * Only for a team with matches this season — otherwise the page already says
   * why there is nothing to show.
   */
  const loaders = result.status === "ok" ? data.loaders(played) : null;
  const analyticsSection =
    loaders === null
      ? null
      : await AnalyticsSection({
          ...loaders,
          // A club page's periods are seasons (specs/041, S13).
          axis: SEASON_AXIS,
          // A failed season lookup is `played = []`, which the comparison
          // would read as "this club has no other seasons" and say so — a
          // database failure dressed as a fact about the club. It reports the
          // outage instead. `not_found` is not a failure: it means the club
          // genuinely has no stored match under this route.
          loadRecords: () =>
            seasons.status !== "error"
              ? loaders.loadRecords()
              : Promise.resolve({ status: "error" as const }),
          loadComparison: () =>
            seasons.status !== "error"
              ? loaders.loadComparison()
              : Promise.resolve({ status: "error" as const }),
        });

  return (
    <PageShell heading={headingOf(data)} headingAction={favourite}>
      {data.lead}
      <p className="mb-6">
        <Link
          className="text-sm hover:underline"
          href={`${basePath}/sarjataulukko?kilpailu=${competitionCode}&kausi=${seasonId}`}
        >
          Sarjataulukkoon
        </Link>
      </p>
      {data.notices}
      {data.controls({ offeredSeasons, seasonCompetitions })}
      <TeamMatchesOutcome
        outcome={outcome}
        table={
          result.status === "ok" ? (
            <TeamPageFold
              className="mt-4"
              count={matchCountLabel(result.matches.length)}
              heading={MATCHES_HEADING}
              headingId="team-matches"
            >
              <MatchListTable
                fourthColumn={data.fourthColumn}
                matchHref={(match) => `${basePath}/ottelu/${match.providerMatchId}`}
                matches={result.matches}
                teamHref={null}
              />
            </TeamPageFold>
          ) : null
        }
      />
      {analyticsSection}
    </PageShell>
  );
}
