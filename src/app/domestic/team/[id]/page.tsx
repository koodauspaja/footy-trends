import type { Metadata } from "next";
import Link from "next/link";
import { MatchListTable } from "@/components/match-list-table";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { RenamedNotice } from "@/components/renamed-notice";
import { TasoSeasonOnlyControls } from "@/components/taso-season-only-controls";
import { TeamSeasonMissing } from "@/components/team-season-missing";
import {
  getDomesticCompetitionName,
  parseDomesticCompetitionParam,
} from "@/lib/domestic-competitions";
import { type DomesticPageContext, resolveDomesticPageContext } from "@/lib/domestic-page-context";
import { getTeamMatches, type TeamMatchesResult } from "@/lib/taso-standings-service";
import type { TeamContextFilter, TeamPageSource } from "@/lib/team-context";
import { resolveTeamDefaults, seasonCandidate } from "@/lib/team-page-context";
import {
  competitionsInSeason,
  getTeamSeasons,
  seasonCompetitions,
  type TeamSeasonsResult,
} from "@/lib/team-seasons";

export const dynamic = "force-dynamic";

const TEAM_HEADING = "Joukkue";
const NOT_FOUND_MESSAGE = "Joukkuetta ei löytynyt.";
const EMPTY_MESSAGE = "Otteluita ei ole saatavilla.";
const ERROR_MESSAGE = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";

const SOURCE: TeamPageSource = { kind: "taso", bucket: "domestic" };

type DomesticTeamPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function nameForTeam(
  match: { homeTeamProviderId: number; homeTeamName: string; awayTeamName: string },
  teamProviderId: number
): string {
  return match.homeTeamProviderId === teamProviderId ? match.homeTeamName : match.awayTeamName;
}

/** What the URL already said, and so what the team's own context must not contradict. */
function filterFrom(params: Record<string, string | string[] | undefined>): TeamContextFilter {
  const competitionParam = parseDomesticCompetitionParam(params.kilpailu);
  const season = seasonCandidate(params.kausi);
  return {
    ...(competitionParam.kind === "valid" ? { competitionCode: competitionParam.code } : {}),
    ...(season === undefined ? {} : { seasonId: season }),
  };
}

type ResolvedTeamPage =
  /** No stored match anywhere in `/kotimaa` — not "none this season". */
  | { status: "not_found" }
  | { status: "error" }
  | {
      status: "ok";
      context: DomesticPageContext;
      teamProviderId: number;
      result: TeamMatchesResult;
      teamName: string | null;
      /** Every competition and season this club has matches for. */
      seasons: TeamSeasonsResult;
    };

/**
 * Everything both `generateMetadata` and the page need.
 *
 * The team's own context is resolved *before* the season context, because it
 * decides which competition that context is fetched for. Both calls are
 * `cache()`d, so Next.js invoking the two entry points separately costs one of
 * each. See specs/020-context-free-team-page.md.
 */
async function resolvePage(
  id: string,
  params: Record<string, string | string[] | undefined>
): Promise<ResolvedTeamPage> {
  const teamProviderId = Number(id);
  const defaults = await resolveTeamDefaults(SOURCE, teamProviderId, filterFrom(params));
  if (defaults.status !== "ok") return defaults;

  const context = await resolveDomesticPageContext(params, defaults.defaults);
  const result = await getTeamMatches(
    context.categoryId,
    context.competitionId,
    teamProviderId,
    context.seasonId,
    context.currentSeason
  );
  const [firstMatch] = result.status === "ok" ? result.matches : [];
  const seasons = await getTeamSeasons(SOURCE, teamProviderId);
  const teamName =
    firstMatch !== undefined
      ? nameForTeam(firstMatch, teamProviderId)
      : seasons.status === "ok"
        ? seasons.teamName
        : null;

  return { status: "ok", context, teamProviderId, result, teamName, seasons };
}

function headingFor(resolved: Extract<ResolvedTeamPage, { status: "ok" }>): string {
  const { seasonCompetitionName, seasonLabel } = resolved.context;
  return resolved.teamName !== null
    ? `${resolved.teamName} – ${seasonCompetitionName} ${seasonLabel}`
    : seasonCompetitionName;
}

export async function generateMetadata({
  params,
  searchParams,
}: DomesticTeamPageProps): Promise<Metadata> {
  const { id } = await params;
  const resolved = await resolvePage(id, (await searchParams) ?? {});
  if (resolved.status === "not_found") return { title: NOT_FOUND_MESSAGE };
  if (resolved.status === "error") return { title: TEAM_HEADING };

  return { title: headingFor(resolved) };
}

export default async function DomesticTeamPage({
  params,
  searchParams,
}: Readonly<DomesticTeamPageProps>) {
  const { id } = await params;
  const resolved = await resolvePage(id, (await searchParams) ?? {});

  // A team with no stored match has no competition to name, so the page offers
  // neither a season selector nor a standings link: every season would fail
  // identically, and the table would be one this team never played in.
  if (resolved.status !== "ok") {
    return (
      <PageShell heading={TEAM_HEADING}>
        <p>{resolved.status === "not_found" ? NOT_FOUND_MESSAGE : ERROR_MESSAGE}</p>
      </PageShell>
    );
  }

  const { context, teamProviderId, result, seasons } = resolved;
  const {
    competitionCode,
    competitionParam,
    competitionName,
    selectableSeasons,
    season,
    seasonId,
    seasonLabel,
    renamedTo,
  } = context;

  const played = seasons.status === "ok" ? seasons.seasons : [];
  // The club's own seasons, so the dropdown stops offering years it spent in
  // another tier — 120 of Veikkausliiga's 264 options ended nowhere. Falls back
  // to the competition's range when the club's seasons could not be read.
  const offeredSeasons =
    played.length > 0
      ? [...new Set(played.map((entry) => entry.seasonId))]
          .sort((left, right) => right - left)
          .map((year) => ({ seasonId: year, label: String(year) }))
      : selectableSeasons;

  const teamHref = (code: string, year: number) =>
    `/kotimaa/joukkue/${teamProviderId}?kilpailu=${code}&kausi=${year}`;
  const sameSeason = competitionsInSeason(played, seasonId).map((entry) => ({
    label: getDomesticCompetitionName(entry.competitionCode),
    href: teamHref(entry.competitionCode, entry.seasonId),
  }));
  const [newestSeason] = played;
  const newest =
    newestSeason === undefined
      ? null
      : {
          label: `${getDomesticCompetitionName(newestSeason.competitionCode)} ${newestSeason.seasonId}`,
          href: teamHref(newestSeason.competitionCode, newestSeason.seasonId),
        };

  return (
    <PageShell heading={headingFor(resolved)}>
      <RenamedNotice renamedTo={renamedTo} />
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
      <TasoSeasonOnlyControls
        actionPath={`/kotimaa/joukkue/${teamProviderId}`}
        competitionCode={competitionCode}
        seasonCompetitions={seasonCompetitions(played)}
        seasons={offeredSeasons}
        selectedSeasonId={seasonId}
      />
      {/* A club that exists but played elsewhere is not an unknown club. */}
      {result.status === "not_found" && played.length > 0 && (
        <TeamSeasonMissing newest={newest} sameSeason={sameSeason} seasonLabel={seasonLabel} />
      )}
      {result.status === "not_found" && played.length === 0 && <p>{NOT_FOUND_MESSAGE}</p>}
      {result.status === "empty" && <p>{EMPTY_MESSAGE}</p>}
      {result.status === "error" && <p>{ERROR_MESSAGE}</p>}
      {result.status === "ok" && (
        <MatchListTable
          matchHref={(match) => `/kotimaa/ottelu/${match.providerMatchId}`}
          matches={result.matches}
          teamHref={null}
          fourthColumn={{ header: "Sarja", render: (match) => match.groupName }}
        />
      )}
    </PageShell>
  );
}
