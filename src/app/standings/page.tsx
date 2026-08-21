import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { StandingsControls } from "@/components/standings-controls";
import { StandingsLegend, StandingsTable } from "@/components/standings-table";
import {
  DEFAULT_COMPETITION_CODE,
  getCompetitionName,
  SUPPORTED_COMPETITIONS,
} from "@/lib/competitions";
import { resolveBasePageContext } from "@/lib/page-context";
import { listSelectableRounds, parseRoundParam } from "@/lib/rounds";
import { getMaxMatchday, getStandings } from "@/lib/standings-service";

export const dynamic = "force-dynamic";

const ERROR_MESSAGE = "Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const INVALID_ROUND_MESSAGE = "Kierrosta ei löytynyt. Näytetään koko kausi.";

type StandingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: StandingsPageProps): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const resolved = await resolveBasePageContext(params);
  if (resolved.status === "error") return { title: resolved.competitionName };

  return { title: `${resolved.competitionName} ${resolved.seasonLabel}` };
}

export default async function StandingsPage({ searchParams }: StandingsPageProps) {
  const params = (await searchParams) ?? {};
  const resolved = await resolveBasePageContext(params);
  if (resolved.status === "error") {
    return (
      <PageShell heading={resolved.competitionName}>
        <p>{ERROR_MESSAGE}</p>
      </PageShell>
    );
  }
  const {
    competitionCode,
    competitionParam,
    competitionName,
    context,
    season,
    seasonId,
    seasonLabel,
  } = resolved;

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
          href={`/ottelut?kilpailu=${competitionCode}&kausi=${seasonId}${
            selectedRound !== undefined ? `&kierros=${selectedRound}` : ""
          }`}
        >
          Kaikki ottelut
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
      {round.kind === "invalid" && <Notice>{INVALID_ROUND_MESSAGE}</Notice>}
      <StandingsControls
        competitions={SUPPORTED_COMPETITIONS}
        selectedCompetitionCode={competitionCode}
        seasons={context.selectableSeasons}
        selectedSeasonId={seasonId}
        availableRounds={availableRounds}
        selectedRound={selectedRound}
      />
      {result.status === "empty" && <p>Sarjataulukkoa ei ole saatavilla.</p>}
      {result.status === "error" && <p>{ERROR_MESSAGE}</p>}
      {result.status === "ok" && (
        <StandingsTable
          standings={result.standings}
          teamHref={(teamProviderId) =>
            `/joukkue/${teamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`
          }
        />
      )}
      <StandingsLegend />
    </PageShell>
  );
}
