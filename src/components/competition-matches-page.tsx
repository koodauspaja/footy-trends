import type { Metadata } from "next";
import Link from "next/link";
import { ContextNotices } from "@/components/context-notices";
import { CupMatchesControls } from "@/components/cup-matches-controls";
import { MatchListTable } from "@/components/match-list-table";
import { MatchesControls } from "@/components/matches-controls";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { type CompetitionRegion, isCupCompetition } from "@/lib/competitions";
import { localiseForRegion } from "@/lib/country-names";
import {
  getStageName,
  isTwoLeggedRound,
  listSeasonStages,
  parseStageParam,
  resolveCurrentStage,
} from "@/lib/cup-stages";
import type { BasePageContext, CompetitionPageOptions } from "@/lib/page-context";
import { resolveBasePageContext } from "@/lib/page-context";
import { listSelectableRounds, parseRoundParam } from "@/lib/rounds";
import { getCupSeason, getMaxMatchday, getRoundMatches } from "@/lib/standings-service";

const ERROR_MESSAGE = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const EMPTY_MESSAGE = "Otteluita ei ole saatavilla.";
const INVALID_STAGE_MESSAGE = "Vaihetta ei löytynyt.";

type ResolvedContext = Extract<BasePageContext, { status: "ok" }>;

export async function matchesMetadata({
  searchParams,
  region,
}: CompetitionPageOptions): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const resolved = await resolveBasePageContext(params, region);
  if (resolved.status === "error") return { title: resolved.competitionName };

  return { title: `${resolved.competitionName} ${resolved.seasonLabel}` };
}

async function renderCupMatches({
  resolved,
  params,
  basePath,
  region,
}: Readonly<{
  resolved: ResolvedContext;
  params: Record<string, string | string[] | undefined>;
  basePath: string;
  region: CompetitionRegion;
}>) {
  const { competitionCode, competitionName, context, seasonId, seasonLabel } = resolved;
  const season = await getCupSeason(competitionCode, seasonId, context.activeSeasonId);
  const seasonMatches = localiseForRegion(season.status === "ok" ? season.matches : [], region);
  const availableStages = listSeasonStages(seasonMatches);

  const stageParam = parseStageParam(params.vaihe, availableStages);
  const selectedStage =
    stageParam.kind === "valid"
      ? stageParam.stage
      : resolveCurrentStage(seasonMatches, availableStages);

  const stageMatches = seasonMatches
    .filter((match) => match.stage === selectedStage)
    .sort((left, right) => left.kickoffAt.getTime() - right.kickoffAt.getTime());

  const heading =
    selectedStage === undefined
      ? `${competitionName} ${seasonLabel}`
      : `${competitionName} ${seasonLabel}, ${getStageName(selectedStage).toLocaleLowerCase("fi-FI")}`;

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
      <ContextNotices resolved={resolved} />
      {stageParam.kind === "invalid" && selectedStage !== undefined && (
        <Notice>{`${INVALID_STAGE_MESSAGE} Näytetään ${getStageName(selectedStage).toLocaleLowerCase("fi-FI")}.`}</Notice>
      )}
      <CupMatchesControls
        basePath={basePath}
        competitionCode={competitionCode}
        seasons={context.selectableSeasons}
        selectedSeasonId={seasonId}
        availableStages={availableStages}
        selectedStage={selectedStage}
      />
      {season.status === "error" && <p>{ERROR_MESSAGE}</p>}
      {season.status !== "error" && stageMatches.length === 0 && <p>{EMPTY_MESSAGE}</p>}
      {stageMatches.length > 0 && (
        <MatchListTable
          matches={stageMatches}
          teamHref={(teamProviderId) =>
            `${basePath}/joukkue/${teamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`
          }
          {...fourthColumnFor(selectedStage, stageMatches)}
        />
      )}
    </PageShell>
  );
}

const TABLE_PRODUCING_STAGES = new Set(["LEAGUE_STAGE", "GROUP_STAGE"]);

type StageMatch = {
  matchday: number | null;
  homeTeamProviderId: number;
  awayTeamProviderId: number;
};

/**
 * The match list's fourth column, or nothing.
 *
 * A league or group phase numbers its matches as rounds. A **two-legged**
 * knockout round numbers them as legs. A single-leg knockout round numbers
 * them as neither — and its `matchday` is whatever the provider happens to
 * carry there, which is null for the World Cup and a continued group counter
 * for the European Championship. Either way it is not a leg, so no column.
 */
function fourthColumnFor(stage: string | undefined, matches: StageMatch[]) {
  if (stage !== undefined && !TABLE_PRODUCING_STAGES.has(stage)) {
    return isTwoLeggedRound(matches)
      ? {
          fourthColumn: {
            header: "Osaottelu",
            render: (match: StageMatch) =>
              match.matchday !== null && match.matchday > 0 ? match.matchday : "",
          },
        }
      : {};
  }

  return {
    fourthColumn: {
      header: "Kierros",
      render: (match: StageMatch) => match.matchday ?? "",
    },
  };
}

/** The league shape: one round at a time, with ◀/▶ navigation. */
async function renderLeagueMatches({
  resolved,
  params,
  basePath,
}: Readonly<{
  resolved: ResolvedContext;
  params: Record<string, string | string[] | undefined>;
  basePath: string;
}>) {
  const { competitionCode, competitionName, context, seasonId, seasonLabel } = resolved;

  const maxMatchday = await getMaxMatchday(competitionCode, seasonId);
  const roundParam = parseRoundParam(params.kierros, maxMatchday);
  const requestedRound = roundParam.kind === "valid" ? roundParam.round : undefined;
  const availableRounds = listSelectableRounds(maxMatchday);

  const result = await getRoundMatches(
    competitionCode,
    seasonId,
    requestedRound,
    context.activeSeasonId
  );

  const heading =
    result.status === "ok"
      ? `${competitionName} ${seasonLabel}, kierros ${result.round}`
      : competitionName;

  return (
    <PageShell heading={heading}>
      <p className="mb-6">
        <Link
          className="text-sm hover:underline"
          href={`${basePath}/sarjataulukko?kilpailu=${competitionCode}&kausi=${seasonId}${
            result.status === "ok" ? `&kierros=${result.round}` : ""
          }`}
        >
          Sarjataulukkoon
        </Link>
      </p>
      <ContextNotices resolved={resolved} />
      {roundParam.kind === "invalid" && result.status === "ok" && (
        <Notice>Kierrosta ei löytynyt. Näytetään kierros {result.round}.</Notice>
      )}
      <MatchesControls
        basePath={basePath}
        competitionCode={competitionCode}
        seasons={context.selectableSeasons}
        selectedSeasonId={seasonId}
        availableRounds={availableRounds}
        selectedRound={result.status === "ok" ? result.round : undefined}
      />
      {result.status === "ok" && maxMatchday !== null && (
        <div className="mb-4 flex items-center gap-4 text-sm">
          {result.round > 1 && (
            <Link
              className="hover:underline"
              href={`${basePath}/ottelut?kilpailu=${competitionCode}&kausi=${seasonId}&kierros=${result.round - 1}`}
            >
              ◀ Edellinen kierros
            </Link>
          )}
          {result.round < maxMatchday && (
            <Link
              className="hover:underline"
              href={`${basePath}/ottelut?kilpailu=${competitionCode}&kausi=${seasonId}&kierros=${result.round + 1}`}
            >
              Seuraava kierros ▶
            </Link>
          )}
        </div>
      )}
      {result.status === "empty" && <p>{EMPTY_MESSAGE}</p>}
      {result.status === "error" && <p>{ERROR_MESSAGE}</p>}
      {result.status === "ok" && result.matches.length === 0 && <p>{EMPTY_MESSAGE}</p>}
      {result.status === "ok" && result.matches.length > 0 && (
        <MatchListTable
          matches={result.matches}
          teamHref={(teamProviderId) =>
            `${basePath}/joukkue/${teamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`
          }
        />
      )}
    </PageShell>
  );
}

/**
 * The match list for one region — `/ulkomaat` or `/maajoukkueet`. One
 * implementation for both; see specs/016-world-cup-and-euro.md.
 */
export async function CompetitionMatchesPage({
  searchParams,
  region,
  basePath,
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
    ? renderCupMatches({ resolved, params, basePath, region })
    : renderLeagueMatches({ resolved, params, basePath });
}
