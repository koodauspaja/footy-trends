import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { TasoStandingsControls } from "@/components/taso-standings-controls";
import { resolveKotimaaPageContext } from "@/lib/kotimaa-page-context";
import { LATEST_TASO_SEASON } from "@/lib/taso";
import {
  getSeasonMatchList,
  getSeasonStandings,
  listSelectableTasoRounds,
  parseTasoRoundParam,
} from "@/lib/taso-standings-service";

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
const EMPTY_MESSAGE = "Sarjataulukkoa ei ole saatavilla.";
const INVALID_ROUND_MESSAGE = "Kierrosta ei löytynyt. Näytetään koko kausi.";

type KotimaaStandingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * TASO's own `group_name` for 2015/2018's single (pre-split) group is
 * literally the string `"1"` — displayed as "Runkosarja" per domain
 * knowledge, since that was the era's name for the season's only phase.
 * See specs/009-veikkausliiga.md's Edge Cases.
 */
function displayGroupName(groupName: string): string {
  return groupName === "1" ? "Runkosarja" : groupName;
}

function cell(value: number | null): string {
  return value === null ? "–" : String(value);
}

export async function generateMetadata({
  searchParams,
}: KotimaaStandingsPageProps): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const resolved = resolveKotimaaPageContext(params);
  return { title: `${resolved.competitionName} ${resolved.seasonLabel}` };
}

export default async function KotimaaStandingsPage({ searchParams }: KotimaaStandingsPageProps) {
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

  const matchListResult = await getSeasonMatchList(competitionId, seasonId, LATEST_TASO_SEASON);
  const availableRounds =
    matchListResult.status === "ok"
      ? listSelectableTasoRounds(matchListResult.matches, competitionId)
      : [];
  const roundParam = parseTasoRoundParam(params.kierros, availableRounds);
  const selectedRound = roundParam.kind === "valid" ? roundParam.round : undefined;

  const result = await getSeasonStandings(
    competitionId,
    seasonId,
    LATEST_TASO_SEASON,
    selectedRound
  );

  return (
    <PageShell heading={`${competitionName} ${seasonLabel}`}>
      <p className="mb-6">
        <Link
          className="text-sm hover:underline"
          href={`/kotimaa/ottelut?kilpailu=${competitionCode}&kausi=${seasonId}`}
        >
          Kaikki ottelut
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
      {roundParam.kind === "invalid" && (
        <p
          className="mb-6 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          {INVALID_ROUND_MESSAGE}
        </p>
      )}
      <TasoStandingsControls
        competitionCode={competitionCode}
        seasons={selectableSeasons}
        selectedSeasonId={seasonId}
        availableRounds={availableRounds}
        selectedRound={selectedRound}
      />
      {result.status === "empty" && <p>{EMPTY_MESSAGE}</p>}
      {result.status === "error" && <p>{ERROR_MESSAGE}</p>}
      {result.status === "ok" &&
        result.groups.map((group) => (
          <section key={group.groupId} className="mb-10">
            <h2 className="mb-3 text-xl font-semibold">{displayGroupName(group.groupName)}</h2>
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
                  {group.standings.map((team) => (
                    <tr className="border-b border-zinc-200" key={team.teamProviderId}>
                      <td className="p-3">{team.position}</td>
                      <th scope="row" className="p-3 font-medium">
                        {team.teamProviderId === 0 ? (
                          team.teamName
                        ) : (
                          <Link
                            className="hover:underline"
                            href={`/kotimaa/joukkue/${team.teamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`}
                          >
                            {team.teamName}
                          </Link>
                        )}
                      </th>
                      <td className="p-3">{cell(team.played)}</td>
                      <td className="p-3">{cell(team.won)}</td>
                      <td className="p-3">{cell(team.drawn)}</td>
                      <td className="p-3">{cell(team.lost)}</td>
                      <td className="p-3">{cell(team.goalsFor)}</td>
                      <td className="p-3">{cell(team.goalsAgainst)}</td>
                      <td className="p-3">{cell(team.goalDifference)}</td>
                      <td className="p-3 font-semibold">{cell(team.points)}</td>
                      <td
                        className="p-3"
                        aria-label={team.form.map((item) => item.label).join(", ")}
                      >
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
          </section>
        ))}
      <p className="mt-4 text-sm text-zinc-500">
        O = ottelut, V = voitot, T = tasapelit, H = häviöt, TM = tehdyt maalit, PM = päästetyt
        maalit, ME = maaliero, P = pisteet.
      </p>
    </PageShell>
  );
}
