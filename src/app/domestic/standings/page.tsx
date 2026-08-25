import type { Metadata } from "next";
import Link from "next/link";
import { MatchListTable } from "@/components/match-list-table";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { RenamedNotice } from "@/components/renamed-notice";
import { StandingsLegend, StandingsTable } from "@/components/standings-table";
import { TasoStandingsControls } from "@/components/taso-standings-controls";
import { resolveDomesticPageContext } from "@/lib/domestic-page-context";
import {
  type GroupStandingsResult,
  getSeasonStandings,
  listSeasonRounds,
  parseTasoRoundParam,
} from "@/lib/taso-standings-service";

export const dynamic = "force-dynamic";

const ERROR_MESSAGE = "Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const EMPTY_MESSAGE = "Sarjataulukkoa ei ole saatavilla.";
const INVALID_ROUND_MESSAGE = "Kierrosta ei löytynyt. Näytetään koko kausi.";
const NO_MATCHES_MESSAGE = "Otteluita ei ole saatavilla.";
/**
 * Shown under a group whose own-calculated table did not reproduce TASO's
 * published points, so TASO's numbers are rendered instead. Naming
 * Palloliitto rather than "TASO" because that is the name a reader knows.
 */
const TASO_FALLBACK_MESSAGE =
  "Näytetään Palloliiton omat pisteet: ne poikkeavat otteluista lasketuista. " +
  "Kierrosvalitsin ei ole käytössä tässä ryhmässä.";

type DomesticStandingsPageProps = {
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

/**
 * One group's body. A group with no table renders as its matches — a knockout
 * group, where TASO returns one row per bracket slot so an advancing team
 * would repeat itself down the rows (specs/010-playoff-group-match-list.md),
 * or a group TASO lists with no teams at all.
 *
 * A pass-through group additionally carries a notice: its numbers are TASO's,
 * not ours, because the two disagreed. See
 * specs/013-more-finnish-competitions.md.
 */
function GroupBody({
  group,
  teamHref,
}: Readonly<{
  group: GroupStandingsResult;
  teamHref: (teamProviderId: number) => string;
}>) {
  if (group.kind !== "match-list") {
    return (
      <>
        {group.kind === "pass-through" && <Notice>{TASO_FALLBACK_MESSAGE}</Notice>}
        <StandingsTable standings={group.standings} teamHref={teamHref} />
      </>
    );
  }

  if (group.matches.length === 0) {
    return <p>{NO_MATCHES_MESSAGE}</p>;
  }

  return (
    <MatchListTable
      matches={group.matches}
      teamHref={teamHref}
      fourthColumn={{ header: "Kierros", render: (match) => match.matchday ?? "–" }}
    />
  );
}

export async function generateMetadata({
  searchParams,
}: DomesticStandingsPageProps): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const resolved = await resolveDomesticPageContext(params);
  return { title: `${resolved.seasonCompetitionName} ${resolved.seasonLabel}` };
}

export default async function DomesticStandingsPage({
  searchParams,
}: Readonly<DomesticStandingsPageProps>) {
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
    categoryId,
    currentSeason,
    seasonCompetitionName,
    renamedTo,
  } = await resolveDomesticPageContext(params);

  const availableRounds = await listSeasonRounds(
    categoryId,
    competitionId,
    seasonId,
    currentSeason
  );
  const roundParam = parseTasoRoundParam(params.kierros, availableRounds);
  const selectedRound = roundParam.kind === "valid" ? roundParam.round : undefined;

  const result = await getSeasonStandings(
    categoryId,
    competitionId,
    seasonId,
    currentSeason,
    selectedRound
  );

  const teamHref = (teamProviderId: number) =>
    `/kotimaa/joukkue/${teamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`;

  return (
    <PageShell heading={`${seasonCompetitionName} ${seasonLabel}`}>
      <RenamedNotice renamedTo={renamedTo} />
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
            <GroupBody group={group} teamHref={teamHref} />
          </section>
        ))}
      <StandingsLegend />
    </PageShell>
  );
}
