import type { Metadata } from "next";
import Link from "next/link";
import { ContextNotices } from "@/components/context-notices";
import { CupBracket } from "@/components/cup-bracket";
import { CupStandingsControls } from "@/components/cup-standings-controls";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { StandingsControls } from "@/components/standings-controls";
import { StandingsLegend, StandingsTable } from "@/components/standings-table";
import { type CompetitionRegion, competitionsInRegion, isCupCompetition } from "@/lib/competitions";
import { toFinnishTeamNames } from "@/lib/country-names";
import { buildBracket } from "@/lib/cup-bracket";
import { buildCupPhaseStandings } from "@/lib/cup-standings";
import type { BasePageContext, CompetitionPageOptions } from "@/lib/page-context";
import { resolveBasePageContext } from "@/lib/page-context";
import { listSelectableRounds, parseRoundParam } from "@/lib/rounds";
import { getCupSeason, getMaxMatchday, getStandings } from "@/lib/standings-service";

const ERROR_MESSAGE = "Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const INVALID_ROUND_MESSAGE = "Kierrosta ei löytynyt. Näytetään koko kausi.";
const NO_STANDINGS_MESSAGE = "Sarjataulukkoa ei ole saatavilla.";
const KNOCKOUT_HEADING = "Pudotuspelit";

type ResolvedContext = Extract<BasePageContext, { status: "ok" }>;

type RegionContext = Readonly<
  { resolved: ResolvedContext } & Pick<
    CompetitionPageOptions,
    "region" | "basePath" | "showCompetitionSelect"
  >
>;

export async function standingsMetadata({
  searchParams,
  region,
}: CompetitionPageOptions): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const resolved = await resolveBasePageContext(params, region);
  if (resolved.status === "error") return { title: resolved.competitionName };

  return { title: `${resolved.competitionName} ${resolved.seasonLabel}` };
}

/**
 * A cup's standings: one table per group of the season's table-producing
 * phase, then the closing knockout rounds as a bracket. No round selector —
 * see `CupStandingsControls`.
 */
async function renderCupStandings({
  resolved,
  region,
  basePath,
  showCompetitionSelect,
}: RegionContext) {
  const { competitionCode, competitionName, context, seasonId, seasonLabel } = resolved;
  const season = await getCupSeason(competitionCode, seasonId, context.activeSeasonId);
  // National teams are countries, and this app is Finnish. Translated once
  // here so the tables, the bracket and every link below read the same.
  const seasonMatches = localiseIfNationalTeams(
    season.status === "ok" ? season.matches : [],
    region
  );
  const phases = buildCupPhaseStandings(seasonMatches);
  const bracket = buildBracket(seasonMatches);
  const teamHref = (teamProviderId: number) =>
    `${basePath}/joukkue/${teamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`;

  return (
    <PageShell heading={`${competitionName} ${seasonLabel}`}>
      <p className="mb-6">
        <Link
          className="text-sm hover:underline"
          href={`${basePath}/ottelut?kilpailu=${competitionCode}&kausi=${seasonId}`}
        >
          Kaikki ottelut
        </Link>
      </p>
      <ContextNotices resolved={resolved} />
      <CupStandingsControls
        basePath={basePath}
        competitions={competitionsInRegion(region)}
        showCompetitionSelect={showCompetitionSelect}
        selectedCompetitionCode={competitionCode}
        seasons={context.selectableSeasons}
        selectedSeasonId={seasonId}
      />
      {season.status === "error" && <p>{ERROR_MESSAGE}</p>}
      {season.status !== "error" && phases.length === 0 && <p>{NO_STANDINGS_MESSAGE}</p>}
      {phases.length > 0 && (
        <div className="flex flex-col gap-8">
          {phases.map((phase) => (
            <section key={phase.group ?? phase.heading}>
              <h2 className="mb-2 font-medium">{phase.heading}</h2>
              <StandingsTable standings={phase.standings} teamHref={teamHref} />
            </section>
          ))}
        </div>
      )}
      {phases.length > 0 && <StandingsLegend />}
      {season.status !== "error" && (
        <section className="mt-8">
          <h2 className="mb-2 font-medium">{KNOCKOUT_HEADING}</h2>
          <CupBracket rounds={bracket} teamHref={teamHref} />
        </section>
      )}
    </PageShell>
  );
}

/**
 * Club names are proper nouns and stay as the provider gives them; a national
 * team is a country, and this app is Finnish.
 */
function localiseIfNationalTeams<T extends { homeTeamName: string; awayTeamName: string }>(
  matches: T[],
  region: CompetitionRegion
): T[] {
  return region === "national-teams" ? toFinnishTeamNames(matches) : matches;
}

/** The league shape: one table for the whole season, with a round filter. */
async function renderLeagueStandings({
  resolved,
  region,
  basePath,
  params,
}: RegionContext & Readonly<{ params: Record<string, string | string[] | undefined> }>) {
  const { competitionCode, competitionName, context, seasonId, seasonLabel } = resolved;

  const maxMatchday = await getMaxMatchday(competitionCode, seasonId);
  const round = parseRoundParam(params.kierros, maxMatchday);
  const selectedRound = round.kind === "valid" ? round.round : undefined;
  const availableRounds = listSelectableRounds(maxMatchday);

  const result = await getStandings({
    competitionCode,
    seasonId,
    activeSeasonId: context.activeSeasonId,
    ...(selectedRound !== undefined ? { round: selectedRound } : {}),
  });

  return (
    <PageShell heading={`${competitionName} ${seasonLabel}`}>
      <p className="mb-6">
        <Link
          className="text-sm hover:underline"
          href={`${basePath}/ottelut?kilpailu=${competitionCode}&kausi=${seasonId}${
            selectedRound !== undefined ? `&kierros=${selectedRound}` : ""
          }`}
        >
          Kaikki ottelut
        </Link>
      </p>
      <ContextNotices resolved={resolved} />
      {round.kind === "invalid" && <Notice>{INVALID_ROUND_MESSAGE}</Notice>}
      <StandingsControls
        availableRounds={availableRounds}
        basePath={basePath}
        competitions={competitionsInRegion(region)}
        selectedCompetitionCode={competitionCode}
        selectedRound={selectedRound}
        seasons={context.selectableSeasons}
        selectedSeasonId={seasonId}
      />
      {result.status === "empty" && <p>{NO_STANDINGS_MESSAGE}</p>}
      {result.status === "error" && <p>{ERROR_MESSAGE}</p>}
      {result.status === "ok" && (
        <StandingsTable
          standings={result.standings}
          teamHref={(teamProviderId) =>
            `${basePath}/joukkue/${teamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`
          }
        />
      )}
      <StandingsLegend />
    </PageShell>
  );
}

/**
 * The standings page for one region — `/ulkomaat` or `/maajoukkueet`.
 *
 * One implementation rather than two, because the regions differ only in which
 * competitions they offer and what their links are prefixed with. See
 * specs/016-world-cup-and-euro.md.
 */
export async function CompetitionStandingsPage({
  searchParams,
  region,
  basePath,
  showCompetitionSelect,
}: Readonly<CompetitionPageOptions>) {
  const params = (await searchParams) ?? {};
  const resolved = await resolveBasePageContext(params, region);
  if (resolved.status === "error") {
    return (
      <PageShell heading={resolved.competitionName}>
        <p>{ERROR_MESSAGE}</p>
      </PageShell>
    );
  }

  return isCupCompetition(resolved.competitionCode)
    ? renderCupStandings({ resolved, region, basePath, showCompetitionSelect })
    : renderLeagueStandings({ resolved, region, basePath, showCompetitionSelect, params });
}
