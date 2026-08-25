import type { Metadata } from "next";
import Link from "next/link";
import { MatchListTable } from "@/components/match-list-table";
import { MatchesControls } from "@/components/matches-controls";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { DEFAULT_COMPETITION_CODE, getCompetitionName } from "@/lib/competitions";
import { resolveBasePageContext } from "@/lib/page-context";
import { listSelectableRounds, parseRoundParam } from "@/lib/rounds";
import { getMaxMatchday, getRoundMatches } from "@/lib/standings-service";

export const dynamic = "force-dynamic";

const ERROR_MESSAGE = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const EMPTY_MESSAGE = "Otteluita ei ole saatavilla.";

type MatchesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: MatchesPageProps): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const resolved = await resolveBasePageContext(params);
  if (resolved.status === "error") return { title: resolved.competitionName };

  return { title: `${resolved.competitionName} ${resolved.seasonLabel}` };
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
      {competitionParam.kind === "invalid" && (
        <Notice>
          Kilpailua ei löytynyt. Näytetään {getCompetitionName(DEFAULT_COMPETITION_CODE)}.
        </Notice>
      )}
      {season.kind === "invalid" && (
        <Notice>Kautta ei löytynyt. Näytetään kausi {seasonLabel}.</Notice>
      )}
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
