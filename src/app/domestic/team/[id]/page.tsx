import type { Metadata } from "next";
import Link from "next/link";
import { ContextNotices } from "@/components/context-notices";
import { MatchListTable } from "@/components/match-list-table";
import { PageShell } from "@/components/page-shell";
import { RenamedNotice } from "@/components/renamed-notice";
import { TasoSeasonOnlyControls } from "@/components/taso-season-only-controls";
import { TeamMatchesOutcome } from "@/components/team-matches-outcome";
import {
  earliestSeasonFor,
  getDomesticCompetitionName,
  parseDomesticCompetitionParam,
} from "@/lib/domestic-competitions";
import { type DomesticPageContext, resolveDomesticPageContext } from "@/lib/domestic-page-context";
import { getTeamMatches, type TeamMatchesResult } from "@/lib/taso-standings-service";
import type { TeamContextFilter, TeamPageSource } from "@/lib/team-context";
import { resolveTeamDefaults, seasonCandidate } from "@/lib/team-page-context";
import {
  getTeamName,
  getTeamSeasons,
  seasonCompetitions,
  type TeamNameResult,
  type TeamSeasonsResult,
  teamSeasonsView,
} from "@/lib/team-seasons";

export const dynamic = "force-dynamic";

const TEAM_HEADING = "Joukkue";
const NOT_FOUND_MESSAGE = "Joukkuetta ei löytynyt.";
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
      /** Whether the name lookup itself failed, which is an outage like any other. */
      nameStatus: TeamNameResult["status"];
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
  // The club's own name, asked for only when there is no match to read it off.
  const name: TeamNameResult =
    firstMatch === undefined
      ? await getTeamName(SOURCE, teamProviderId)
      : { status: "ok", name: nameForTeam(firstMatch, teamProviderId) };
  const teamName = name.status === "ok" ? name.name : null;

  return {
    status: "ok",
    context,
    teamProviderId,
    result,
    teamName,
    nameStatus: name.status,
    seasons,
  };
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

  const { context, teamProviderId, result, nameStatus, seasons } = resolved;
  const {
    competitionCode,
    competitionParam,
    competitionName,
    currentSeason,
    season,
    seasonId,
    seasonLabel,
    renamedTo,
  } = context;

  const played = seasons.status === "ok" ? seasons.seasons : [];
  // Either lookup failing is an outage, and neither is a club that does not exist.
  const lookups = nameStatus === "error" ? "error" : seasons.status;

  const { offeredSeasons, sameSeason, newest } = teamSeasonsView(played, seasonId, {
    season: String,
    competition: getDomesticCompetitionName,
    href: (code, year) => `/kotimaa/joukkue/${teamProviderId}?kilpailu=${code}&kausi=${year}`,
    selectable: (code, year) => year >= earliestSeasonFor(code) && year <= currentSeason,
  });
  // Everything the body needs, in one value: the two lookups' verdicts and
  // where the club was instead.
  const outcome = { result: result.status, seasons: lookups, seasonLabel, sameSeason, newest };

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
      <ContextNotices resolved={{ competitionParam, competitionName, season, seasonLabel }} />
      <TasoSeasonOnlyControls
        actionPath={`/kotimaa/joukkue/${teamProviderId}`}
        competitionCode={competitionCode}
        seasonCompetitions={seasonCompetitions(played)}
        seasons={offeredSeasons}
        selectedSeasonId={seasonId}
      />
      <TeamMatchesOutcome
        outcome={outcome}
        table={
          result.status === "ok" ? (
            <MatchListTable
              fourthColumn={{ header: "Sarja", render: (match) => match.groupName }}
              matchHref={(match) => `/kotimaa/ottelu/${match.providerMatchId}`}
              matches={result.matches}
              teamHref={null}
            />
          ) : null
        }
      />
    </PageShell>
  );
}
