import type { Metadata } from "next";
import Link from "next/link";
import { MatchListTable } from "@/components/match-list-table";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { TeamSeasonSelector } from "@/components/team-season-selector";
import { toFinnishTeamNames } from "@/lib/country-names";
import {
  type BasePageContext,
  type CompetitionPageOptions,
  resolveBasePageContext,
} from "@/lib/page-context";
import { getTeamMatches, type TeamMatchesResult } from "@/lib/standings-service";

const ERROR_MESSAGE = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const NOT_FOUND_MESSAGE = "Joukkuetta ei löytynyt.";
const EMPTY_MESSAGE = "Otteluita ei ole saatavilla.";

/** A team page's own `params`, on top of the shared region options. */
export type CompetitionTeamPageOptions = CompetitionPageOptions & {
  params: Promise<{ id: string }>;
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
  params: Record<string, string | string[] | undefined>,
  region: CompetitionPageOptions["region"]
): Promise<PageContext> {
  const base = await resolveBasePageContext(params, region);
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

  // A national team is a country, and this app is Finnish.
  const localised =
    result.status === "ok" && region === "national-teams"
      ? ({ ...result, matches: toFinnishTeamNames(result.matches) } as typeof result)
      : result;

  const [firstMatch] = localised.status === "ok" ? localised.matches : [];
  const teamName = firstMatch === undefined ? null : nameForTeam(firstMatch, teamProviderId);

  return { ...base, teamProviderId, result: localised, teamName };
}

export async function teamMetadata({
  params,
  searchParams,
  region,
}: CompetitionTeamPageOptions): Promise<Metadata> {
  const { id } = await params;
  const resolvedParams = (await searchParams) ?? {};
  const resolved = await resolvePageContext(id, resolvedParams, region);
  if (resolved.status === "error") return { title: resolved.competitionName };

  return {
    title:
      resolved.teamName !== null
        ? `${resolved.teamName} – ${resolved.competitionName} ${resolved.seasonLabel}`
        : resolved.competitionName,
  };
}

/**
 * A team's page for one region — `/ulkomaat` or `/maajoukkueet`. One
 * implementation for both; see specs/016-world-cup-and-euro.md.
 */
export async function CompetitionTeamPage({
  params,
  searchParams,
  region,
  basePath,
}: Readonly<CompetitionTeamPageOptions>) {
  const { id } = await params;
  const resolvedParams = (await searchParams) ?? {};
  const resolved = await resolvePageContext(id, resolvedParams, region);
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
          href={`${basePath}/sarjataulukko?kilpailu=${competitionCode}&kausi=${seasonId}`}
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
        <TeamSeasonSelector
          basePath={basePath}
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
          matchHref={(match) => `${basePath}/ottelu/${match.providerMatchId}`}
          teamHref={null}
          fourthColumn={{ header: "Kierros", render: (match) => match.matchday ?? "" }}
        />
      )}
    </PageShell>
  );
}
