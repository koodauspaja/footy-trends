import Link from "next/link";
import { MatchesControls } from "@/components/matches-controls";
import { PageShell } from "@/components/page-shell";
import { getSeasonContext, type SeasonContext } from "@/lib/football-data";
import { logger } from "@/lib/logger";
import { listSelectableRounds, parseRoundParam } from "@/lib/rounds";
import { formatSeasonLabel, parseSeasonParam } from "@/lib/seasons";
import { getMaxMatchday, getRoundMatches } from "@/lib/standings-service";

export const dynamic = "force-dynamic";

const COMPETITION_CODE = "PL";
const BASE_HEADING = "Ottelut";
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

async function resolveSeasonContext(): Promise<SeasonContext | null> {
  try {
    return await getSeasonContext(COMPETITION_CODE);
  } catch (error) {
    logger.error({ err: error }, "Unable to resolve the selectable seasons");
    return null;
  }
}

export default async function MatchesPage({ searchParams }: MatchesPageProps) {
  const context = await resolveSeasonContext();
  if (context === null) {
    return (
      <PageShell heading={BASE_HEADING}>
        <p>{ERROR_MESSAGE}</p>
      </PageShell>
    );
  }

  const params = (await searchParams) ?? {};
  const season = parseSeasonParam(params.kausi, context.selectableSeasons);
  const seasonId = season.kind === "valid" ? season.seasonId : context.activeSeasonId;
  const seasonLabel = formatSeasonLabel(seasonId);

  const maxMatchday = await getMaxMatchday(COMPETITION_CODE, seasonId);
  const roundParam = parseRoundParam(params.kierros, maxMatchday);
  const requestedRound = roundParam.kind === "valid" ? roundParam.round : undefined;
  const availableRounds = listSelectableRounds(maxMatchday);

  const result = await getRoundMatches(
    COMPETITION_CODE,
    seasonId,
    requestedRound,
    context.activeSeasonId
  );

  const heading =
    result.status === "ok"
      ? `${BASE_HEADING} ${seasonLabel}, kierros ${result.round}`
      : BASE_HEADING;

  return (
    <PageShell heading={heading}>
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
              href={`/ottelut?kausi=${seasonId}&kierros=${result.round - 1}`}
            >
              ◀ Edellinen kierros
            </Link>
          )}
          {result.round < maxMatchday && (
            <Link
              className="hover:underline"
              href={`/ottelut?kausi=${seasonId}&kierros=${result.round + 1}`}
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
                      href={`/joukkue/${match.homeTeamProviderId}?kausi=${seasonId}`}
                    >
                      {match.homeTeamName}
                    </Link>
                    {" – "}
                    <Link
                      className="hover:underline"
                      href={`/joukkue/${match.awayTeamProviderId}?kausi=${seasonId}`}
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
