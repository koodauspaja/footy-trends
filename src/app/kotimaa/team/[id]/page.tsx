import type { Metadata } from "next";
import Link from "next/link";
import { MatchListTable } from "@/components/match-list-table";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { TasoSeasonOnlyControls } from "@/components/taso-season-only-controls";
import { resolveKotimaaPageContext } from "@/lib/kotimaa-page-context";
import { getTeamMatches, type TeamMatchesResult } from "@/lib/taso-standings-service";

export const dynamic = "force-dynamic";

const NOT_FOUND_MESSAGE = "Joukkuetta ei löytynyt.";
const EMPTY_MESSAGE = "Otteluita ei ole saatavilla.";
const ERROR_MESSAGE = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";

type KotimaaTeamPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function nameForTeam(
  match: { homeTeamProviderId: number; homeTeamName: string; awayTeamName: string },
  teamProviderId: number
): string {
  return match.homeTeamProviderId === teamProviderId ? match.homeTeamName : match.awayTeamName;
}

async function resolveTeamName(
  competitionId: string,
  teamProviderId: number,
  seasonId: number,
  currentSeason: number
): Promise<{ result: TeamMatchesResult; teamName: string | null }> {
  const result = await getTeamMatches(competitionId, teamProviderId, seasonId, currentSeason);
  const [firstMatch] = result.status === "ok" ? result.matches : [];
  const teamName = firstMatch === undefined ? null : nameForTeam(firstMatch, teamProviderId);
  return { result, teamName };
}

export async function generateMetadata({
  params,
  searchParams,
}: KotimaaTeamPageProps): Promise<Metadata> {
  const { id } = await params;
  const resolvedParams = (await searchParams) ?? {};
  const { competitionName, seasonLabel, seasonId, competitionId, currentSeason } =
    await resolveKotimaaPageContext(resolvedParams);
  const teamProviderId = Number(id);

  if (Number.isNaN(teamProviderId)) return { title: competitionName };
  const { teamName } = await resolveTeamName(
    competitionId,
    teamProviderId,
    seasonId,
    currentSeason
  );

  return {
    title: teamName !== null ? `${teamName} – ${competitionName} ${seasonLabel}` : competitionName,
  };
}

export default async function KotimaaTeamPage({
  params,
  searchParams,
}: Readonly<KotimaaTeamPageProps>) {
  const { id } = await params;
  const resolvedParams = (await searchParams) ?? {};
  const {
    competitionCode,
    competitionParam,
    competitionName,
    selectableSeasons,
    season,
    seasonId,
    seasonLabel,
    competitionId,
    currentSeason,
  } = await resolveKotimaaPageContext(resolvedParams);

  const teamProviderId = Number(id);
  const { result, teamName } = Number.isNaN(teamProviderId)
    ? { result: { status: "not_found" } as TeamMatchesResult, teamName: null }
    : await resolveTeamName(competitionId, teamProviderId, seasonId, currentSeason);

  const heading =
    teamName !== null ? `${teamName} – ${competitionName} ${seasonLabel}` : competitionName;

  return (
    <PageShell heading={heading}>
      <p className="mb-6">
        <Link
          className="text-sm hover:underline"
          href={`/kotimaa/sarjataulukko?kilpailu=${competitionCode}&kausi=${seasonId}`}
        >
          Sarjataulukkoon
        </Link>
      </p>
      {competitionParam.kind === "invalid" && (
        <Notice>Kilpailua ei löytynyt. Näytetään {competitionName}.</Notice>
      )}
      {season.kind === "invalid" && (
        <Notice>Kautta ei löytynyt. Näytetään kausi {seasonLabel}.</Notice>
      )}
      {!Number.isNaN(teamProviderId) && (
        <TasoSeasonOnlyControls
          actionPath={`/kotimaa/joukkue/${teamProviderId}`}
          competitionCode={competitionCode}
          seasons={selectableSeasons}
          selectedSeasonId={seasonId}
        />
      )}
      {result.status === "not_found" && <p>{NOT_FOUND_MESSAGE}</p>}
      {result.status === "empty" && <p>{EMPTY_MESSAGE}</p>}
      {result.status === "error" && <p>{ERROR_MESSAGE}</p>}
      {result.status === "ok" && (
        <MatchListTable
          matches={result.matches}
          teamHref={null}
          fourthColumn={{ header: "Sarja", render: (match) => match.groupName }}
        />
      )}
    </PageShell>
  );
}
