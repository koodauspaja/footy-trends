import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { StandingsControls } from "@/components/standings-controls";
import {
  DEFAULT_COMPETITION_CODE,
  getCompetitionName,
  SUPPORTED_COMPETITIONS,
} from "@/lib/competitions";
import { resolveBasePageContext } from "@/lib/page-context";
import { listSelectableRounds, parseRoundParam } from "@/lib/rounds";
import { getMaxMatchday, getStandings } from "@/lib/standings-service";

export const dynamic = "force-dynamic";

const columns = [
  ["O", "Ottelut"],
  ["V", "Voitot"],
  ["T", "Tasapelit"],
  ["H", "Häviöt"],
  ["TM", "Tehdyt maalit"],
  ["PM", "Päästetyt maalit"],
  ["ME", "Maaliero"],
  ["P", "Pisteet"],
] as const;

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
      {round.kind === "invalid" && (
        <p
          className="mb-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          {INVALID_ROUND_MESSAGE}
        </p>
      )}
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-300 text-sm text-zinc-600">
                <th className="p-3">Sija</th>
                <th className="p-3">Joukkue</th>
                {columns.map(([short, title]) => (
                  <th className="p-3" key={short} title={title}>
                    {short}
                  </th>
                ))}
                <th className="p-3">Vire</th>
              </tr>
            </thead>
            <tbody>
              {result.standings.map((team) => (
                <tr className="border-b border-zinc-200" key={team.teamProviderId}>
                  <td className="p-3">{team.position}</td>
                  <th scope="row" className="p-3 font-medium">
                    <Link
                      className="hover:underline"
                      href={`/joukkue/${team.teamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`}
                    >
                      {team.teamName}
                    </Link>
                  </th>
                  <td className="p-3">{team.played}</td>
                  <td className="p-3">{team.won}</td>
                  <td className="p-3">{team.drawn}</td>
                  <td className="p-3">{team.lost}</td>
                  <td className="p-3">{team.goalsFor}</td>
                  <td className="p-3">{team.goalsAgainst}</td>
                  <td className="p-3">{team.goalDifference}</td>
                  <td className="p-3 font-semibold">{team.points}</td>
                  <td className="p-3" aria-label={team.form.map((item) => item.label).join(", ")}>
                    {team.form.map((item) => (
                      <span className="mr-1" key={item.matchId} title={item.label}>
                        {item.result}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-sm text-zinc-500">
        O = ottelut, V = voitot, T = tasapelit, H = häviöt, TM = tehdyt maalit, PM = päästetyt
        maalit, ME = maaliero, P = pisteet.
      </p>
    </PageShell>
  );
}
