import type { Metadata } from "next";
import Link from "next/link";
import { MatchListTable } from "@/components/match-list-table";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { TeamSeasonSelector } from "@/components/team-season-selector";
import { DEFAULT_COMPETITION_CODE, getCompetitionName } from "@/lib/competitions";
import { type BasePageContext, resolveBasePageContext } from "@/lib/page-context";
import { getTeamMatches, type TeamMatchesResult } from "@/lib/standings-service";

export const dynamic = "force-dynamic";

const ERROR_MESSAGE = "Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const NOT_FOUND_MESSAGE = "Joukkuetta ei löytynyt.";
const EMPTY_MESSAGE = "Otteluita ei ole saatavilla.";

type TeamPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PageContext =
  | { status: "error"; competitionName: string }
  | (Extract<BasePageContext, { status: "ok" }> & {
      teamProviderId: number;
      result: TeamMatchesResult;
      teamName: string | null;
    });

/**
 * Resolves everything both `generateMetadata` and the page itself need —
 * the competition, season context, resolved team, and its name (for the
 * title) — on top of `resolveBasePageContext`. Called once from each
 * (Next.js invokes them separately), but `getSeasonContext` and
 * `getTeamMatches` are wrapped in React's `cache()`, so the underlying
 * fetches only happen once per request regardless.
 */
/** Which side of the match this team played, so its own name can be read off it. */
function nameForTeam(
  match: { homeTeamProviderId: number; homeTeamName: string; awayTeamName: string },
  teamProviderId: number
): string {
  return match.homeTeamProviderId === teamProviderId ? match.homeTeamName : match.awayTeamName;
}

async function resolvePageContext(
  id: string,
  params: Record<string, string | string[] | undefined>
): Promise<PageContext> {
  const base = await resolveBasePageContext(params);
  if (base.status === "error") return base;

  const teamProviderId = Number(id);
  const result = Number.isNaN(teamProviderId)
    ? ({ status: "not_found" } as const)
    : await getTeamMatches(
        base.competitionCode,
        teamProviderId,
        base.seasonId,
        base.context.activeSeasonId
      );

  const [firstMatch] = result.status === "ok" ? result.matches : [];
  const teamName = firstMatch === undefined ? null : nameForTeam(firstMatch, teamProviderId);

  return { ...base, teamProviderId, result, teamName };
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

export default async function TeamPage({ params, searchParams }: Readonly<TeamPageProps>) {
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
        <Notice>
          Kilpailua ei löytynyt. Näytetään {getCompetitionName(DEFAULT_COMPETITION_CODE)}.
        </Notice>
      )}
      {season.kind === "invalid" && (
        <Notice>Kautta ei löytynyt. Näytetään kausi {seasonLabel}.</Notice>
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
        <MatchListTable
          matches={result.matches}
          teamHref={null}
          fourthColumn={{ header: "Kierros", render: (match) => match.matchday ?? "" }}
        />
      )}
    </PageShell>
  );
}
