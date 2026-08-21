import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { TasoSeasonOnlyControls } from "@/components/taso-season-only-controls";
import { resolveKotimaaPageContext } from "@/lib/kotimaa-page-context";
import { LATEST_TASO_SEASON } from "@/lib/taso";
import { getTeamMatches, type TeamMatchesResult } from "@/lib/taso-standings-service";

export const dynamic = "force-dynamic";

const NOT_FOUND_MESSAGE = "Joukkuetta ei löytynyt.";
const EMPTY_MESSAGE = "Otteluita ei ole saatavilla.";
const ERROR_MESSAGE = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";

const dateFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

type KotimaaTeamPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function resolveTeamName(
  competitionId: string,
  teamProviderId: number,
  seasonId: number
): Promise<{ result: TeamMatchesResult; teamName: string | null }> {
  const result = await getTeamMatches(competitionId, teamProviderId, seasonId, LATEST_TASO_SEASON);
  const [firstMatch] = result.status === "ok" ? result.matches : [];
  const teamName =
    firstMatch === undefined
      ? null
      : firstMatch.homeTeamProviderId === teamProviderId
        ? firstMatch.homeTeamName
        : firstMatch.awayTeamName;
  return { result, teamName };
}

export async function generateMetadata({
  params,
  searchParams,
}: KotimaaTeamPageProps): Promise<Metadata> {
  const { id } = await params;
  const resolvedParams = (await searchParams) ?? {};
  const { competitionName, seasonLabel, seasonId, competitionId } =
    resolveKotimaaPageContext(resolvedParams);
  const teamProviderId = Number(id);

  if (Number.isNaN(teamProviderId)) return { title: competitionName };
  const { teamName } = await resolveTeamName(competitionId, teamProviderId, seasonId);

  return {
    title: teamName !== null ? `${teamName} – ${competitionName} ${seasonLabel}` : competitionName,
  };
}

export default async function KotimaaTeamPage({ params, searchParams }: KotimaaTeamPageProps) {
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
  } = resolveKotimaaPageContext(resolvedParams);

  const teamProviderId = Number(id);
  const { result, teamName } = Number.isNaN(teamProviderId)
    ? { result: { status: "not_found" } as TeamMatchesResult, teamName: null }
    : await resolveTeamName(competitionId, teamProviderId, seasonId);

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
        <p
          className="mb-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          Kilpailua ei löytynyt. Näytetään {competitionName}.
        </p>
      )}
      {season.kind === "invalid" && (
        <p
          className="mb-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          Kautta ei löytynyt. Näytetään kausi {seasonLabel}.
        </p>
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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-300 text-sm text-zinc-600">
                <th className="p-3">Pvm</th>
                <th className="p-3">Ottelu</th>
                <th className="p-3">Tulos</th>
                <th className="p-3">Sarja</th>
              </tr>
            </thead>
            <tbody>
              {result.matches.map((match) => (
                <tr className="border-b border-zinc-200" key={match.providerMatchId}>
                  <td className="p-3">{dateFormatter.format(match.kickoffAt)}</td>
                  <td className="p-3">{`${match.homeTeamName} – ${match.awayTeamName}`}</td>
                  <td className="p-3">
                    {match.homeGoals !== null && match.awayGoals !== null
                      ? `${match.homeGoals}–${match.awayGoals}`
                      : "–"}
                  </td>
                  <td className="p-3">{match.groupName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
