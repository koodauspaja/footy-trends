import type { Metadata } from "next";
import Link from "next/link";
import { MatchesControls } from "@/components/matches-controls";
import { PageShell } from "@/components/page-shell";
import { DEFAULT_COMPETITION_CODE, getCompetitionName } from "@/lib/competitions";
import { resolveBasePageContext } from "@/lib/page-context";
import { listSelectableRounds, parseRoundParam } from "@/lib/rounds";
import { getMaxMatchday, getRoundMatches } from "@/lib/standings-service";

export const dynamic = "force-dynamic";

const ERROR_MESSAGE = "Otteluiden lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const EMPTY_MESSAGE = "Otteluita ei ole saatavilla.";

const dateFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

type MatchesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: MatchesPageProps): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const resolved = await resolveBasePageContext(params);
  if (resolved.status === "error") return { title: resolved.competitionName };

  return { title: `${resolved.competitionName} ${resolved.seasonLabel}` };
}

export default async function MatchesPage({ searchParams }: MatchesPageProps) {
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
          href={`/sarjataulukko?kilpailu=${competitionCode}&kausi=${seasonId}${
            result.status === "ok" ? `&kierros=${result.round}` : ""
          }`}
        >
          Sarjataulukkoon
        </Link>
      </p>
      {competitionParam.kind === "invalid" && (
        <p
          className="mb-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          Kilpailua ei löytynyt. Näytetään {getCompetitionName(DEFAULT_COMPETITION_CODE)}.
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
      {roundParam.kind === "invalid" && result.status === "ok" && (
        <p
          className="mb-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          Kierrosta ei löytynyt. Näytetään kierros {result.round}.
        </p>
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
              href={`/ottelut?kilpailu=${competitionCode}&kausi=${seasonId}&kierros=${result.round - 1}`}
            >
              ◀ Edellinen kierros
            </Link>
          )}
          {result.round < maxMatchday && (
            <Link
              className="hover:underline"
              href={`/ottelut?kilpailu=${competitionCode}&kausi=${seasonId}&kierros=${result.round + 1}`}
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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-300 text-sm text-zinc-600">
                <th className="p-3">Pvm</th>
                <th className="p-3">Ottelu</th>
                <th className="p-3">Tulos</th>
              </tr>
            </thead>
            <tbody>
              {result.matches.map((match) => (
                <tr className="border-b border-zinc-200" key={match.providerMatchId}>
                  <td className="p-3">{dateFormatter.format(match.kickoffAt)}</td>
                  <td className="p-3">
                    <Link
                      className="hover:underline"
                      href={`/joukkue/${match.homeTeamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`}
                    >
                      {match.homeTeamName}
                    </Link>
                    {" – "}
                    <Link
                      className="hover:underline"
                      href={`/joukkue/${match.awayTeamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`}
                    >
                      {match.awayTeamName}
                    </Link>
                  </td>
                  <td className="p-3">
                    {match.homeGoals !== null && match.awayGoals !== null
                      ? `${match.homeGoals}–${match.awayGoals}`
                      : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
