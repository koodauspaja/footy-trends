import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { TasoSeasonOnlyControls } from "@/components/taso-season-only-controls";
import { resolveKotimaaPageContext } from "@/lib/kotimaa-page-context";
import { LATEST_TASO_SEASON } from "@/lib/taso";
import { getSeasonMatchList } from "@/lib/taso-standings-service";

export const dynamic = "force-dynamic";

const ERROR_MESSAGE = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const EMPTY_MESSAGE = "Otteluita ei ole saatavilla.";

const dateFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

type KotimaaMatchesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  searchParams,
}: KotimaaMatchesPageProps): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const resolved = resolveKotimaaPageContext(params);
  return { title: `${resolved.competitionName} ${resolved.seasonLabel}` };
}

export default async function KotimaaMatchesPage({ searchParams }: KotimaaMatchesPageProps) {
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
  } = resolveKotimaaPageContext(params);

  const result = await getSeasonMatchList(competitionId, seasonId, LATEST_TASO_SEASON);

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
        <p
          className="mb-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          Kilpailua ei löytynyt. Näytetään {competitionName}.
        </p>
      )}
      {season.kind === "invalid" && (
        <p
          className="mb-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          Kautta ei löytynyt. Näytetään kausi {seasonLabel}.
        </p>
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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-300 text-sm text-zinc-600">
                <th className="p-3">Pvm</th>
                <th className="p-3">Ottelu</th>
                <th className="p-3">Tulos</th>
                <th className="p-3">Sarja</th>
              </tr>
            </thead>
            <tbody>
              {result.matches.map((match) => (
                <tr className="border-b border-zinc-200" key={match.providerMatchId}>
                  <td className="p-3">{dateFormatter.format(match.kickoffAt)}</td>
                  <td className="p-3">
                    <Link
                      className="hover:underline"
                      href={`/kotimaa/joukkue/${match.homeTeamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`}
                    >
                      {match.homeTeamName}
                    </Link>
                    {" – "}
                    <Link
                      className="hover:underline"
                      href={`/kotimaa/joukkue/${match.awayTeamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`}
                    >
                      {match.awayTeamName}
                    </Link>
                  </td>
                  <td className="p-3">
                    {match.homeGoals !== null && match.awayGoals !== null
                      ? `${match.homeGoals}–${match.awayGoals}`
                      : "–"}
                  </td>
                  <td className="p-3">{match.groupName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
