import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { TeamSeasonSelector } from "@/components/team-season-selector";
import {
  type CompetitionParamResult,
  DEFAULT_COMPETITION_CODE,
  getCompetitionName,
  parseCompetitionParam,
} from "@/lib/competitions";
import { getSeasonContext, type SeasonContext } from "@/lib/football-data";
import { logger } from "@/lib/logger";
import { formatSeasonLabel, parseSeasonParam, type SeasonParamResult } from "@/lib/seasons";
import { getTeamMatches, type TeamMatchesResult } from "@/lib/standings-service";

export const dynamic = "force-dynamic";

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

type PageContext =
  | { status: "error"; competitionName: string }
  | {
      status: "ok";
      teamProviderId: number;
      competitionCode: string;
      competitionParam: CompetitionParamResult;
      competitionName: string;
      context: SeasonContext;
      season: SeasonParamResult;
      seasonId: number;
      seasonLabel: string;
      result: TeamMatchesResult;
      teamName: string | null;
    };

/**
 * Resolves everything both `generateMetadata` and the page itself need —
 * the competition, season context, resolved team, and its name (for the
 * title). Called once from each (Next.js invokes them separately), but
 * `getSeasonContext` and `getTeamMatches` are wrapped in React's `cache()`,
 * so the underlying fetches only happen once per request regardless.
 */
async function resolvePageContext(
  id: string,
  params: Record<string, string | string[] | undefined>
): Promise<PageContext> {
  const teamProviderId = Number(id);
  const competitionParam = parseCompetitionParam(params.kilpailu);
  const competitionCode =
    competitionParam.kind === "valid" ? competitionParam.code : DEFAULT_COMPETITION_CODE;
  const competitionName = getCompetitionName(competitionCode);

  const context = await resolveSeasonContext(competitionCode);
  if (context === null) return { status: "error", competitionName };

  const season = parseSeasonParam(params.kausi, context.selectableSeasons);
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

  return {
    status: "ok",
    teamProviderId,
    competitionCode,
    competitionParam,
    competitionName,
    context,
    season,
    seasonId,
    seasonLabel,
    result,
    teamName,
  };
}

export async function generateMetadata({ params, searchParams }: TeamPageProps): Promise<Metadata> {
  const { id } = await params;
  const resolvedParams = (await searchParams) ?? {};
  const resolved = await resolvePageContext(id, resolvedParams);
  if (resolved.status === "error") return { title: resolved.competitionName };

  return {
    title:
      resolved.teamName !== null
        ? `${resolved.teamName} – ${resolved.competitionName} ${resolved.seasonLabel}`
        : resolved.competitionName,
  };
}

export default async function TeamPage({ params, searchParams }: TeamPageProps) {
  const { id } = await params;
  const resolvedParams = (await searchParams) ?? {};
  const resolved = await resolvePageContext(id, resolvedParams);
  if (resolved.status === "error") {
    return (
      <PageShell heading={resolved.competitionName}>
        <p>{ERROR_MESSAGE}</p>
      </PageShell>
    );
  }
  const {
    teamProviderId,
    competitionCode,
    competitionParam,
    competitionName,
    context,
    season,
    seasonId,
    seasonLabel,
    result,
    teamName,
  } = resolved;
  const heading =
    teamName !== null ? `${teamName} – ${competitionName} ${seasonLabel}` : competitionName;

  return (
    <PageShell heading={heading}>
      <p className="mb-6">
        <Link
          className="text-sm hover:underline"
          href={`/sarjataulukko?kilpailu=${competitionCode}&kausi=${seasonId}`}
        >
          Sarjataulukkoon
        </Link>
      </p>
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
