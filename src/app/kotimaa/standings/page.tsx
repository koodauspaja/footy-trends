import type { Metadata } from "next";
import Link from "next/link";
import { MatchListTable } from "@/components/match-list-table";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { StandingsLegend, StandingsTable } from "@/components/standings-table";
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

const ERROR_MESSAGE = "Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const EMPTY_MESSAGE = "Sarjataulukkoa ei ole saatavilla.";
const INVALID_ROUND_MESSAGE = "Kierrosta ei löytynyt. Näytetään koko kausi.";
const NO_MATCHES_MESSAGE = "Otteluita ei ole saatavilla.";

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

export async function generateMetadata({
  searchParams,
}: KotimaaStandingsPageProps): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const resolved = resolveKotimaaPageContext(params);
  return { title: `${resolved.competitionName} ${resolved.seasonLabel}` };
}

export default async function KotimaaStandingsPage({
  searchParams,
}: Readonly<KotimaaStandingsPageProps>) {
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

  const teamHref = (teamProviderId: number) =>
    `/kotimaa/joukkue/${teamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`;

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
        <Notice>Kilpailua ei löytynyt. Näytetään {competitionName}.</Notice>
      )}
      {season.kind === "invalid" && (
        <Notice>Kautta ei löytynyt. Näytetään kausi {seasonLabel}.</Notice>
      )}
      {roundParam.kind === "invalid" && <Notice>{INVALID_ROUND_MESSAGE}</Notice>}
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
            {/* A knockout group has no table: TASO returns one row per
                bracket slot, so an advancing team would repeat. Its matches
                are the standings — see specs/010-playoff-group-match-list.md. */}
            {group.kind === "playoff" ? (
              group.matches.length === 0 ? (
                <p>{NO_MATCHES_MESSAGE}</p>
              ) : (
                <MatchListTable
                  matches={group.matches}
                  teamHref={teamHref}
                  fourthColumn={{
                    header: "Kierros",
                    render: (match) => match.matchday ?? "–",
                  }}
                />
              )
            ) : (
              <StandingsTable standings={group.standings} teamHref={teamHref} />
            )}
          </section>
        ))}
      <StandingsLegend />
    </PageShell>
  );
}
