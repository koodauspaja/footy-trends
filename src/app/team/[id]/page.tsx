import { PageShell } from "@/components/page-shell";
import { TeamSeasonSelector } from "@/components/team-season-selector";
import {
  DEFAULT_COMPETITION_CODE,
  getCompetitionName,
  parseCompetitionParam,
} from "@/lib/competitions";
import { getSeasonContext, type SeasonContext } from "@/lib/football-data";
import { logger } from "@/lib/logger";
import { formatSeasonLabel, parseSeasonParam } from "@/lib/seasons";
import { getTeamMatches } from "@/lib/standings-service";

export const dynamic = "force-dynamic";

const BASE_HEADING = "Joukkueen ottelut";
const ERROR_MESSAGE = "Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const NOT_FOUND_MESSAGE = "Joukkuetta ei löytynyt.";
const EMPTY_MESSAGE = "Otteluita ei ole saatavilla.";

const dateFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

type TeamPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function resolveSeasonContext(competitionCode: string): Promise<SeasonContext | null> {
  try {
    return await getSeasonContext(competitionCode);
  } catch (error) {
    logger.error({ err: error, competitionCode }, "Unable to resolve the selectable seasons");
    return null;
  }
}

export default async function TeamPage({ params, searchParams }: TeamPageProps) {
  const { id } = await params;
  const teamProviderId = Number(id);

  const resolvedParams = (await searchParams) ?? {};
  const competitionParam = parseCompetitionParam(resolvedParams.kilpailu);
  const competitionCode =
    competitionParam.kind === "valid" ? competitionParam.code : DEFAULT_COMPETITION_CODE;

  const context = await resolveSeasonContext(competitionCode);
  if (context === null) {
    return (
      <PageShell heading={BASE_HEADING}>
        <p>{ERROR_MESSAGE}</p>
      </PageShell>
    );
  }

  const season = parseSeasonParam(resolvedParams.kausi, context.selectableSeasons);
  const seasonId = season.kind === "valid" ? season.seasonId : context.activeSeasonId;
  const seasonLabel = formatSeasonLabel(seasonId);

  const result = Number.isNaN(teamProviderId)
    ? ({ status: "not_found" } as const)
    : await getTeamMatches(competitionCode, teamProviderId, seasonId, context.activeSeasonId);

  const [firstMatch] = result.status === "ok" ? result.matches : [];
  const teamName =
    firstMatch === undefined
      ? null
      : firstMatch.homeTeamProviderId === teamProviderId
        ? firstMatch.homeTeamName
        : firstMatch.awayTeamName;
  const heading = teamName !== null ? `${teamName} ${seasonLabel}` : BASE_HEADING;

  return (
    <PageShell heading={heading}>
      {competitionParam.kind === "invalid" && (
        <p
          className="mb-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          Kilpailua ei löytynyt. Näytetään {getCompetitionName(DEFAULT_COMPETITION_CODE)}.
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
        <TeamSeasonSelector
          teamProviderId={teamProviderId}
          competitionCode={competitionCode}
          seasons={context.selectableSeasons}
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
                <th className="p-3">Kierros</th>
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
                  <td className="p-3">{match.matchday ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
