import type { Metadata } from "next";
import Link from "next/link";
import { MatchListTable } from "@/components/match-list-table";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { TasoSeasonOnlyControls } from "@/components/taso-season-only-controls";
import { resolveDomesticPageContext } from "@/lib/domestic-page-context";
import { getSeasonMatchList } from "@/lib/taso-standings-service";

export const dynamic = "force-dynamic";

const ERROR_MESSAGE = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const EMPTY_MESSAGE = "Otteluita ei ole saatavilla.";

type DomesticMatchesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  searchParams,
}: DomesticMatchesPageProps): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const resolved = await resolveDomesticPageContext(params);
  return { title: `${resolved.competitionName} ${resolved.seasonLabel}` };
}

export default async function DomesticMatchesPage({
  searchParams,
}: Readonly<DomesticMatchesPageProps>) {
  const params = (await searchParams) ?? {};
  const {
    competitionCode,
    competitionParam,
    competitionName,
    selectableSeasons,
    season,
    seasonId,
    seasonLabel,
    competitionId,
    currentSeason,
  } = await resolveDomesticPageContext(params);

  const result = await getSeasonMatchList(competitionId, seasonId, currentSeason);

  return (
    <PageShell heading={`${competitionName} ${seasonLabel}`}>
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
        actionPath="/kotimaa/ottelut"
        competitionCode={competitionCode}
        seasons={selectableSeasons}
        selectedSeasonId={seasonId}
      />
      {result.status === "empty" && <p>{EMPTY_MESSAGE}</p>}
      {result.status === "error" && <p>{ERROR_MESSAGE}</p>}
      {result.status === "ok" && result.matches.length === 0 && <p>{EMPTY_MESSAGE}</p>}
      {result.status === "ok" && result.matches.length > 0 && (
        <MatchListTable
          matches={result.matches}
          teamHref={(teamProviderId) =>
            `/kotimaa/joukkue/${teamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`
          }
          fourthColumn={{ header: "Sarja", render: (match) => match.groupName }}
        />
      )}
    </PageShell>
  );
}
