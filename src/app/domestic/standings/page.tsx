import type { Metadata } from "next";
import Link from "next/link";
import { CompetitionAnalyticsSection } from "@/components/competition-analytics";
import { BracketTree } from "@/components/cup-bracket";
import { FoldMarker } from "@/components/fold-marker";
import { MatchListTable } from "@/components/match-list-table";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { RenamedNotice } from "@/components/renamed-notice";
import { StandingsLegend, StandingsTable } from "@/components/standings-table";
import { TasoStandingsControls } from "@/components/taso-standings-controls";
import { buildCupBracket, buildPlayoffBracket, normaliseRoundName } from "@/lib/cup-rounds";
import { cupFormatFor, isDomesticCup } from "@/lib/domestic-competitions";
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
 * published points, so TASO's numbers are rendered instead.
 *
 * decisions/013-more-finnish-competitions.md
 */
const TASO_FALLBACK_MESSAGE =
  "Näytetään Palloliiton omat pisteet: ne poikkeavat otteluista lasketuista. " +
  "Kierrosvalitsin ei ole käytössä tässä ryhmässä.";

type DomesticStandingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * A group's name as the page shows it. TASO's `group_name` for the single
 * pre-split group of 2015 and 2018 is the string `"1"`, shown as `Runkosarja`.
 *
 * decisions/009-veikkausliiga.md
 * decisions/015-finnish-cups.md
 */
function displayGroupName(groupName: string): string {
  if (groupName === "1") return "Runkosarja";
  // Cup rounds also normalise the two names TASO spells differently across
  // eras. A league group name is never one of them.
  return normaliseRoundName(groupName);
}

const KNOCKOUT_HEADING = "Pudotuspelit";

/**
 * One group's body. A group with no table renders as its matches; a
 * pass-through group also carries a notice that its numbers are TASO's.
 *
 * decisions/010-playoff-group-match-list.md
 * decisions/013-more-finnish-competitions.md
 * decisions/015-finnish-cups.md
 */
function GroupBody({
  group,
  teamHref,
  isCup,
}: Readonly<{
  group: GroupStandingsResult;
  teamHref: (teamProviderId: number) => string;
  /** A cup round drops the `Kierros` column — see the render below. */
  isCup: boolean;
}>) {
  if (group.kind !== "match-list") {
    return (
      <>
        {group.kind === "pass-through" && <Notice>{TASO_FALLBACK_MESSAGE}</Notice>}
        <StandingsTable favouriteSource="taso" standings={group.standings} teamHref={teamHref} />
      </>
    );
  }

  if (group.matches.length === 0) {
    return <p>{NO_MATCHES_MESSAGE}</p>;
  }

  // A cup round is one round, and the heading above already names it, so no
  // `Kierros` column. A league's playoff group can span rounds and keeps it.
  if (isCup) {
    return (
      <MatchListTable
        matches={group.matches}
        matchHref={(match) => `/kotimaa/ottelu/${match.providerMatchId}`}
        teamHref={teamHref}
      />
    );
  }

  return (
    <MatchListTable
      matches={group.matches}
      matchHref={(match) => `/kotimaa/ottelu/${match.providerMatchId}`}
      teamHref={teamHref}
      fourthColumn={{ header: "Kierros", render: (match) => match.matchday ?? "–" }}
    />
  );
}

/**
 * One round, collapsible with `<details>`, and open to begin with.
 *
 * decisions/015-finnish-cups.md
 * decisions/419-shared-fold-marker.md
 */
function CupRoundSection({
  group,
  teamHref,
}: Readonly<{
  group: GroupStandingsResult;
  teamHref: (teamProviderId: number) => string;
}>) {
  return (
    <details className="group mb-10 border-border-subtle border-b pb-4" open>
      <summary className="mb-3 flex cursor-pointer list-none items-baseline gap-2">
        <FoldMarker />
        <h2 className="font-semibold text-xl">{displayGroupName(group.groupName)}</h2>
        {group.kind === "match-list" && (
          <span className="text-sm text-muted">{`(${group.matches.length} ottelua)`}</span>
        )}
      </summary>
      <GroupBody group={group} isCup teamHref={teamHref} />
    </details>
  );
}

/**
 * A `groups-and-playoff` cup's season: the group tables first, then
 * `Pudotuspelit`, where any knockout group the tree does not draw is listed
 * before the tree. Suomen Cup never comes here.
 *
 * decisions/043-liigacup.md
 */
function GroupsAndPlayoff({
  groups,
  teamHref,
}: Readonly<{
  groups: GroupStandingsResult[];
  teamHref: (teamProviderId: number) => string;
}>) {
  const tables = groups.filter((group) => group.kind !== "match-list");
  const knockout = groups.flatMap((group) => (group.kind === "match-list" ? [group] : []));
  const { rounds, drawnGroupIds } = buildPlayoffBracket(knockout);
  const listed = knockout.filter((group) => !drawnGroupIds.has(group.groupId));

  return (
    <>
      {tables.map((group) => (
        <section className="mb-10" key={group.groupId}>
          <h2 className="mb-3 font-semibold text-xl">{displayGroupName(group.groupName)}</h2>
          <GroupBody group={group} isCup teamHref={teamHref} />
        </section>
      ))}
      {tables.length > 0 && <StandingsLegend />}
      {(listed.length > 0 || rounds.length > 0) && (
        <section className="mt-10 mb-10">
          <h2 className="mb-3 font-semibold text-xl">{KNOCKOUT_HEADING}</h2>
          {listed.map((group) => (
            <section className="mb-8" key={group.groupId}>
              <h3 className="mb-3 font-semibold text-lg">{displayGroupName(group.groupName)}</h3>
              <GroupBody group={group} isCup teamHref={teamHref} />
            </section>
          ))}
          {rounds.length > 0 && <BracketTree rounds={rounds} teamHref={teamHref} />}
        </section>
      )}
    </>
  );
}

export async function generateMetadata({
  searchParams,
}: DomesticStandingsPageProps): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const resolved = await resolveDomesticPageContext(params);
  return { title: `${resolved.seasonCompetitionName} ${resolved.seasonLabel}` };
}

/**
 * A domestic competition's standings: tables for a league, rounds and a
 * bracket for a cup.
 *
 * decisions/009-veikkausliiga.md
 * decisions/015-finnish-cups.md
 * decisions/043-liigacup.md
 * decisions/048-league-goals-per-game-trend.md
 */
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

  // Under the tables, on the leagues `CompetitionAnalyticsSection` covers;
  // `null` elsewhere.
  const analytics = await CompetitionAnalyticsSection({
    kind: "taso",
    competitionCode,
    selectedSeasonId: seasonId,
    activeSeasonId: currentSeason,
    seasonLabel: String,
  });

  const isCup = isDomesticCup(competitionCode);
  const isGroupsAndPlayoff = cupFormatFor(competitionCode) === "groups-and-playoff";
  const teamHref = (teamProviderId: number) =>
    `/kotimaa/joukkue/${teamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`;

  // Above the rounds, not below them as Champions League does. A
  // `groups-and-playoff` cup draws its own bracket.
  const bracket =
    result.status === "ok" && !isGroupsAndPlayoff
      ? buildCupBracket(
          result.groups.flatMap((group) =>
            group.kind === "match-list"
              ? [{ groupId: group.groupId, groupName: group.groupName, matches: group.matches }]
              : []
          )
        )
      : [];

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
      {bracket.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 font-semibold text-xl">{KNOCKOUT_HEADING}</h2>
          <BracketTree rounds={bracket} teamHref={teamHref} />
        </section>
      )}
      {result.status === "ok" && isGroupsAndPlayoff && (
        <GroupsAndPlayoff groups={result.groups} teamHref={teamHref} />
      )}
      {result.status === "ok" &&
        !isGroupsAndPlayoff &&
        result.groups.map((group) =>
          isCup ? (
            <CupRoundSection group={group} key={group.groupId} teamHref={teamHref} />
          ) : (
            <section className="mb-10" key={group.groupId}>
              <h2 className="mb-3 font-semibold text-xl">{displayGroupName(group.groupName)}</h2>
              <GroupBody group={group} isCup={false} teamHref={teamHref} />
            </section>
          )
        )}
      {!isGroupsAndPlayoff && <StandingsLegend />}
      {analytics}
    </PageShell>
  );
}
