import type { Metadata } from "next";
import Link from "next/link";
import { CupMatchesControls } from "@/components/cup-matches-controls";
import { MatchListTable } from "@/components/match-list-table";
import { MatchesControls } from "@/components/matches-controls";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { DEFAULT_COMPETITION_CODE, getCompetitionName, isCupCompetition } from "@/lib/competitions";
import {
  getStageName,
  listSeasonStages,
  parseStageParam,
  resolveCurrentStage,
} from "@/lib/cup-stages";
import type { BasePageContext } from "@/lib/page-context";
import { resolveBasePageContext } from "@/lib/page-context";
import { listSelectableRounds, parseRoundParam } from "@/lib/rounds";
import { getCupSeason, getMaxMatchday, getRoundMatches } from "@/lib/standings-service";

export const dynamic = "force-dynamic";

const ERROR_MESSAGE = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const EMPTY_MESSAGE = "Otteluita ei ole saatavilla.";
const INVALID_STAGE_MESSAGE = "Vaihetta ei löytynyt.";

type MatchesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ResolvedContext = Extract<BasePageContext, { status: "ok" }>;

export async function generateMetadata({ searchParams }: MatchesPageProps): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const resolved = await resolveBasePageContext(params);
  if (resolved.status === "error") return { title: resolved.competitionName };

  return { title: `${resolved.competitionName} ${resolved.seasonLabel}` };
}

function ContextNotices({ resolved }: Readonly<{ resolved: ResolvedContext }>) {
  return (
    <>
      {resolved.competitionParam.kind === "invalid" && (
        <Notice>
          Kilpailua ei löytynyt. Näytetään {getCompetitionName(DEFAULT_COMPETITION_CODE)}.
        </Notice>
      )}
      {resolved.season.kind === "invalid" && (
        <Notice>Kautta ei löytynyt. Näytetään kausi {resolved.seasonLabel}.</Notice>
      )}
    </>
  );
}

/**
 * A cup's match list, chunked by stage rather than by round: a cup's
 * `matchday` is a leg number (1 or 2, and 0 for a final), so it cannot drive
 * the ◀/▶ navigation the league page uses.
 */
async function renderCupMatches({
  resolved,
  params,
}: Readonly<{
  resolved: ResolvedContext;
  params: Record<string, string | string[] | undefined>;
}>) {
  const { competitionCode, competitionName, context, seasonId, seasonLabel } = resolved;
  const season = await getCupSeason(competitionCode, seasonId, context.activeSeasonId);
  const seasonMatches = season.status === "ok" ? season.matches : [];
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
          href={`/ulkomaat/sarjataulukko?kilpailu=${competitionCode}&kausi=${seasonId}`}
        >
          Sarjataulukkoon
        </Link>
      </p>
      <ContextNotices resolved={resolved} />
      {stageParam.kind === "invalid" && selectedStage !== undefined && (
        <Notice>{`${INVALID_STAGE_MESSAGE} Näytetään ${getStageName(selectedStage).toLocaleLowerCase("fi-FI")}.`}</Notice>
      )}
      <CupMatchesControls
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
            `/ulkomaat/joukkue/${teamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`
          }
          fourthColumn={{
            // A knockout stage numbers its matches as legs, a league or group
            // phase as rounds — the same `matchday` field, two meanings, so
            // the header has to follow the stage. A final carries matchday 0,
            // which is neither, and renders blank.
            header: isLegNumbered(selectedStage) ? "Osaottelu" : "Kierros",
            render: (match) =>
              match.matchday !== null && match.matchday > 0 ? match.matchday : "",
          }}
        />
      )}
    </PageShell>
  );
}

const TABLE_PRODUCING_STAGES = ["LEAGUE_STAGE", "GROUP_STAGE"];

function isLegNumbered(stage: string | undefined): boolean {
  return stage !== undefined && !TABLE_PRODUCING_STAGES.includes(stage);
}

/** The league shape: one round at a time, with ◀/▶ navigation. */
async function renderLeagueMatches({
  resolved,
  params,
}: Readonly<{
  resolved: ResolvedContext;
  params: Record<string, string | string[] | undefined>;
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
          href={`/ulkomaat/sarjataulukko?kilpailu=${competitionCode}&kausi=${seasonId}${
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
              href={`/ulkomaat/ottelut?kilpailu=${competitionCode}&kausi=${seasonId}&kierros=${result.round - 1}`}
            >
              ◀ Edellinen kierros
            </Link>
          )}
          {result.round < maxMatchday && (
            <Link
              className="hover:underline"
              href={`/ulkomaat/ottelut?kilpailu=${competitionCode}&kausi=${seasonId}&kierros=${result.round + 1}`}
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
            `/ulkomaat/joukkue/${teamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`
          }
        />
      )}
    </PageShell>
  );
}

export default async function MatchesPage({ searchParams }: Readonly<MatchesPageProps>) {
  const params = (await searchParams) ?? {};
  const resolved = await resolveBasePageContext(params);
  if (resolved.status === "error") {
    return (
      <PageShell heading={resolved.competitionName}>
        <p>{ERROR_MESSAGE}</p>
      </PageShell>
    );
  }

  return isCupCompetition(resolved.competitionCode)
    ? renderCupMatches({ resolved, params })
    : renderLeagueMatches({ resolved, params });
}
