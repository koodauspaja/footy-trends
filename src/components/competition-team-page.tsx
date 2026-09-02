import type { Metadata } from "next";
import Link from "next/link";
import { ContextNotices } from "@/components/context-notices";
import { MatchListTable } from "@/components/match-list-table";
import { PageShell } from "@/components/page-shell";
import { TeamMatchesOutcome } from "@/components/team-matches-outcome";
import { TeamSeasonSelector } from "@/components/team-season-selector";
import { getCompetitionName, parseCompetitionParam } from "@/lib/competitions";
import { toFinnishCountryName, toFinnishTeamNames } from "@/lib/country-names";
import {
  type BasePageContext,
  type CompetitionPageOptions,
  resolveBasePageContext,
} from "@/lib/page-context";
import { formatSeasonLabel } from "@/lib/seasons";
import { getTeamMatches, type TeamMatchesResult } from "@/lib/standings-service";
import type { TeamContextFilter } from "@/lib/team-context";
import { resolveTeamDefaults, seasonCandidate } from "@/lib/team-page-context";
import {
  getTeamName,
  getTeamSeasons,
  seasonCompetitions,
  type TeamNameResult,
  type TeamSeasonsResult,
  teamSeasonsView,
} from "@/lib/team-seasons";

const ERROR_MESSAGE = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const TEAM_HEADING = "Joukkue";
const NOT_FOUND_MESSAGE = "Joukkuetta ei löytynyt.";

/** A team page's own `params`, on top of the shared region options. */
export type CompetitionTeamPageOptions = CompetitionPageOptions & {
  params: Promise<{ id: string }>;
};

type PageContext =
  /** No stored match anywhere in this region — not "none this season". */
  | { status: "not_found" }
  | { status: "error"; competitionName: string }
  | (Extract<BasePageContext, { status: "ok" }> & {
      teamProviderId: number;
      result: TeamMatchesResult;
      teamName: string | null;
      /** Whether the name lookup itself failed, which is an outage like any other. */
      nameStatus: TeamNameResult["status"];
      /** Every competition and season this club has matches for. */
      seasons: TeamSeasonsResult;
    });

/** What the URL already said, and so what the team's own context must not contradict. */
function filterFrom(
  params: Record<string, string | string[] | undefined>,
  region: CompetitionPageOptions["region"]
): TeamContextFilter {
  const competitionParam = parseCompetitionParam(params.kilpailu, region);
  const season = seasonCandidate(params.kausi);
  return {
    ...(competitionParam.kind === "valid" ? { competitionCode: competitionParam.code } : {}),
    ...(season === undefined ? {} : { seasonId: season }),
  };
}

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
  const teamProviderId = Number(id);
  // Resolved before the season context, because it decides which competition
  // that context is fetched for. See specs/020-context-free-team-page.md.
  const defaults = await resolveTeamDefaults(
    { kind: "football-data", region },
    teamProviderId,
    filterFrom(params, region)
  );
  if (defaults.status === "not_found") return defaults;
  if (defaults.status === "error") return { status: "error", competitionName: TEAM_HEADING };

  const base = await resolveBasePageContext(params, region, defaults.defaults);
  if (base.status === "error") return base;

  const result = await getTeamMatches(
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
  const source = { kind: "football-data", region } as const;
  const seasons = await getTeamSeasons(source, teamProviderId);
  // The club's own name, asked for only when there is no match to read it off.
  const name: TeamNameResult =
    firstMatch === undefined
      ? await getTeamName(source, teamProviderId)
      : { status: "ok", name: nameForTeam(firstMatch, teamProviderId) };
  const storedName = name.status === "ok" ? name.name : null;
  // A national team is a country, and this app is Finnish — the same treatment
  // `localised` gives the match list, applied to a name read straight from the
  // database. Without it this page alone says "England".
  const teamName =
    storedName !== null && region === "national-teams"
      ? toFinnishCountryName(storedName)
      : storedName;

  return { ...base, teamProviderId, result: localised, teamName, nameStatus: name.status, seasons };
}

export async function teamMetadata({
  params,
  searchParams,
  region,
}: CompetitionTeamPageOptions): Promise<Metadata> {
  const { id } = await params;
  const resolvedParams = (await searchParams) ?? {};
  const resolved = await resolvePageContext(id, resolvedParams, region);
  if (resolved.status === "not_found") return { title: NOT_FOUND_MESSAGE };
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
  // A team with no stored match has no competition to name, so the page offers
  // neither a season selector nor a standings link: every season would fail
  // identically, and the table would be one this team never played in.
  if (resolved.status === "not_found") {
    return (
      <PageShell heading={TEAM_HEADING}>
        <p>{NOT_FOUND_MESSAGE}</p>
      </PageShell>
    );
  }
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
    nameStatus,
    seasons,
  } = resolved;

  const heading =
    teamName !== null ? `${teamName} – ${competitionName} ${seasonLabel}` : competitionName;

  const played = seasons.status === "ok" ? seasons.seasons : [];
  // Either lookup failing is an outage, and neither is a club that does not exist.
  const lookups = nameStatus === "error" ? "error" : seasons.status;

  const { offeredSeasons, sameSeason, newest } = teamSeasonsView(played, seasonId, {
    season: (year) => formatSeasonLabel(year, context.spansCalendarYears),
    competition: getCompetitionName,
    href: (code, year) => `${basePath}/joukkue/${teamProviderId}?kilpailu=${code}&kausi=${year}`,
  });
  // Everything the body needs, in one value: the two lookups' verdicts and
  // where the club was instead.
  const outcome = { result: result.status, seasons: lookups, seasonLabel, sameSeason, newest };

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
      <ContextNotices resolved={{ competitionParam, competitionName, season, seasonLabel }} />
      <TeamSeasonSelector
        basePath={basePath}
        competitionCode={competitionCode}
        seasonCompetitions={seasonCompetitions(played)}
        seasons={offeredSeasons.length > 0 ? offeredSeasons : context.selectableSeasons}
        selectedSeasonId={seasonId}
        teamProviderId={teamProviderId}
      />
      <TeamMatchesOutcome
        outcome={outcome}
        table={
          result.status === "ok" ? (
            <MatchListTable
              fourthColumn={{ header: "Kierros", render: (match) => match.matchday ?? "" }}
              matchHref={(match) => `${basePath}/ottelu/${match.providerMatchId}`}
              matches={result.matches}
              teamHref={null}
            />
          ) : null
        }
      />
    </PageShell>
  );
}
