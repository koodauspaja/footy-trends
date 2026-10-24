import type { Metadata } from "next";
import Link from "next/link";
import { CompetitionAnalyticsSection } from "@/components/competition-analytics";
import { BracketTree } from "@/components/cup-bracket";
import { CupForecastSection } from "@/components/cup-forecast";
import { FoldMarker } from "@/components/fold-marker";
import { TABLE_HEADING } from "@/components/heading-classes";
import { KNOCKOUT_LIST_FOLD, TABLE_FOLD, TableFold } from "@/components/heading-folds";
import { MatchListTable } from "@/components/match-list-table";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { RenamedNotice } from "@/components/renamed-notice";
import { StandingsLegend, StandingsTable } from "@/components/standings-table";
import { TasoStandingsControls } from "@/components/taso-standings-controls";
import { canSeeAnalytics } from "@/lib/analytics-access";
import { type GroupZones, groupZones, zoneLine } from "@/lib/competition-zones";
import { buildCupBracket, buildPlayoffBracket, normaliseRoundName } from "@/lib/cup-rounds";
import { KNOCKOUT_PHASE } from "@/lib/cup-stages";
import { cupFormatFor, isDomesticCup } from "@/lib/domestic-competitions";
import { resolveDomesticPageContext } from "@/lib/domestic-page-context";
import { cupGroupOrder, openCupGroups } from "@/lib/group-order";
import { getCupForecast, hasCupForecast } from "@/lib/knockout-simulation-service";
import { matchCountLabel } from "@/lib/match-count";
import { getPageSections } from "@/lib/section-choices";
import { type FoldState, foldFor } from "@/lib/section-keys";
import {
  type GroupLevel,
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

/**
 * Under the last group's list of what its positions lead to: whose words the
 * labels are.
 *
 * decisions/063-competition-zones.md
 */
const ZONE_SOURCE_MESSAGE = "Sijoitusten merkitykset ovat Palloliiton tulospalvelusta.";

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

/**
 * One group's body. A group with no table renders as its matches; a
 * pass-through group also carries a notice that its numbers are TASO's.
 *
 * decisions/010-playoff-group-match-list.md
 * decisions/013-more-finnish-competitions.md
 * decisions/015-finnish-cups.md
 * decisions/063-competition-zones.md
 */
function GroupBody({
  group,
  teamHref,
  isCup,
  ruleAfter = [],
}: Readonly<{
  group: GroupStandingsResult;
  teamHref: (teamProviderId: number) => string;
  /** A cup round drops the `Kierros` column — see the render below. */
  isCup: boolean;
  /** The places of this group's table a heavier rule follows. Omitted means none. */
  ruleAfter?: readonly number[];
}>) {
  if (group.kind !== "match-list") {
    return (
      <>
        {group.kind === "pass-through" && <Notice>{TASO_FALLBACK_MESSAGE}</Notice>}
        <StandingsTable
          favouriteSource="taso"
          ruleAfter={ruleAfter}
          standings={group.standings}
          teamHref={teamHref}
        />
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
 * A group's zones on its table as drawn, or none for a group with no table.
 *
 * decisions/063-competition-zones.md
 */
function zonesOf(group: GroupStandingsResult, levels: readonly GroupLevel[]): GroupZones {
  if (group.kind === "match-list") return { zones: [], ruleAfter: [] };
  return groupZones(
    levels.filter((level) => level.groupId === group.groupId),
    group.standings.length
  );
}

/**
 * A league's groups, each table with the list of what its positions lead to
 * under it, and the source of the labels once, under the last list.
 *
 * decisions/063-competition-zones.md
 */
function LeagueGroups({
  groups,
  levels,
  fold,
  teamHref,
}: Readonly<{
  groups: GroupStandingsResult[];
  levels: readonly GroupLevel[];
  /** Tables start open, a league's knockout lists closed, neither remembered. */
  fold: FoldState;
  teamHref: (teamProviderId: number) => string;
}>) {
  const zoned = groups.map((group) => ({ group, ...zonesOf(group, levels) }));
  const lastWithList = zoned.findLast(({ zones }) => zones.length > 0)?.group.groupId;

  return zoned.map(({ group, zones, ruleAfter }) => (
    <TableFold
      fold={fold}
      heading={displayGroupName(group.groupName)}
      headingId={`standings-group-${group.groupId}`}
      key={group.groupId}
    >
      <GroupBody group={group} isCup={false} ruleAfter={ruleAfter} teamHref={teamHref} />
      {zones.length > 0 && (
        <ul className="mt-3 text-sm">
          {zones.map((zone) => (
            <li key={zone.from}>{zoneLine(zone)}</li>
          ))}
        </ul>
      )}
      {group.groupId === lastWithList && (
        <p className="mt-2 text-sm text-muted">{ZONE_SOURCE_MESSAGE}</p>
      )}
    </TableFold>
  ));
}

/**
 * One round, collapsible with `<details>`, open to begin with when it starts on
 * the latest round's day.
 *
 * decisions/015-finnish-cups.md
 * decisions/419-shared-fold-marker.md
 * decisions/698-long-lists-start-closed.md
 */
function CupRoundSection({
  group,
  open,
  teamHref,
}: Readonly<{
  group: GroupStandingsResult;
  open: boolean;
  teamHref: (teamProviderId: number) => string;
}>) {
  return (
    <details className="group mb-10 border-border-subtle border-b pb-4" open={open}>
      <summary className="mb-3 flex cursor-pointer list-none items-baseline gap-2">
        <FoldMarker />
        <h2 className={TABLE_HEADING}>{displayGroupName(group.groupName)}</h2>
        {group.kind === "match-list" && (
          <span className="text-sm text-muted">{`(${matchCountLabel(group.matches.length)})`}</span>
        )}
      </summary>
      <GroupBody group={group} isCup teamHref={teamHref} />
    </details>
  );
}

/**
 * A knockout cup's rounds, latest first: those starting on the latest round's
 * day open, the rest closed.
 *
 * decisions/015-finnish-cups.md
 * decisions/714-page-section-order.md
 * decisions/698-long-lists-start-closed.md
 */
function CupRounds({
  groups,
  teamHref,
}: Readonly<{
  groups: GroupStandingsResult[];
  teamHref: (teamProviderId: number) => string;
}>) {
  const matches = groups.flatMap((group) => (group.kind === "match-list" ? group.matches : []));
  const open = openCupGroups(groups, matches);
  return cupGroupOrder(groups, matches).map((group) => (
    <CupRoundSection
      group={group}
      key={group.groupId}
      open={open.has(group.groupId)}
      teamHref={teamHref}
    />
  ));
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
  knockoutFold,
  teamHref,
}: Readonly<{
  groups: GroupStandingsResult[];
  knockoutFold: FoldState;
  teamHref: (teamProviderId: number) => string;
}>) {
  const tables = groups.filter((group) => group.kind !== "match-list");
  const knockout = groups.flatMap((group) => (group.kind === "match-list" ? [group] : []));
  const { rounds, drawnGroupIds } = buildPlayoffBracket(knockout);
  const listed = knockout.filter((group) => !drawnGroupIds.has(group.groupId));

  return (
    <>
      {tables.map((group) => (
        <TableFold
          fold={TABLE_FOLD}
          heading={displayGroupName(group.groupName)}
          headingId={`standings-group-${group.groupId}`}
          key={group.groupId}
        >
          <GroupBody group={group} isCup teamHref={teamHref} />
        </TableFold>
      ))}
      {tables.length > 0 && <StandingsLegend />}
      {(listed.length > 0 || rounds.length > 0) && (
        <TableFold
          className="mt-10 mb-10"
          fold={knockoutFold}
          heading={KNOCKOUT_PHASE}
          headingId="standings-knockout"
        >
          {listed.map((group) => (
            <section className="mb-8" key={group.groupId}>
              <h3 className="mb-3 font-semibold text-lg">{displayGroupName(group.groupName)}</h3>
              <GroupBody group={group} isCup teamHref={teamHref} />
            </section>
          ))}
          {rounds.length > 0 && <BracketTree rounds={rounds} teamHref={teamHref} />}
        </TableFold>
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
 * decisions/063-competition-zones.md
 * decisions/067-knockout-simulation.md
 * decisions/714-page-section-order.md
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

  const isCup = isDomesticCup(competitionCode);
  const result = await getSeasonStandings(
    categoryId,
    competitionId,
    seasonId,
    currentSeason,
    selectedRound,
    isCup ? "taso" : "league"
  );

  // The reader's folds on every standings page, read once.
  const sections = await getPageSections("standings");
  // Under the tables, on the leagues `CompetitionAnalyticsSection` covers;
  // `null` elsewhere.
  const analytics = await CompetitionAnalyticsSection({
    sections,
    kind: "taso",
    competitionCode,
    selectedSeasonId: seasonId,
    activeSeasonId: currentSeason,
    seasonLabel: String,
  });

  // A Suomen Cup's forecast, signed in only; the gate is asked only for a cup that has one.
  const cupForecast =
    hasCupForecast(competitionCode) && (await canSeeAnalytics())
      ? await getCupForecast(competitionCode, seasonId, currentSeason)
      : { status: "unavailable" as const };

  const isGroupsAndPlayoff = cupFormatFor(competitionCode) === "groups-and-playoff";
  const teamHref = (teamProviderId: number) =>
    `/kotimaa/joukkue/${teamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`;

  // After a league's tables and above a cup's rounds. A `groups-and-playoff`
  // cup draws its own bracket.
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
          className="text-sm"
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
      {result.status === "ok" && isGroupsAndPlayoff && (
        <GroupsAndPlayoff
          groups={result.groups}
          knockoutFold={foldFor(sections, "knockout")}
          teamHref={teamHref}
        />
      )}
      {result.status === "ok" && !isGroupsAndPlayoff && !isCup && (
        <LeagueGroups
          fold={TABLE_FOLD}
          groups={result.groups.filter((group) => group.kind !== "match-list")}
          levels={result.levels}
          teamHref={teamHref}
        />
      )}
      {bracket.length > 0 && (
        // A Suomen Cup's first section, so its most basic part (decisions/714).
        <TableFold
          fold={foldFor(sections, "knockout", isCup)}
          heading={KNOCKOUT_PHASE}
          headingId="standings-knockout"
        >
          <BracketTree rounds={bracket} teamHref={teamHref} />
        </TableFold>
      )}
      {result.status === "ok" && !isGroupsAndPlayoff && !isCup && (
        <LeagueGroups
          fold={KNOCKOUT_LIST_FOLD}
          groups={result.groups.filter((group) => group.kind === "match-list")}
          levels={result.levels}
          teamHref={teamHref}
        />
      )}
      {result.status === "ok" && !isGroupsAndPlayoff && isCup && (
        <CupRounds groups={result.groups} teamHref={teamHref} />
      )}
      {cupForecast.status === "unavailable" ? null : (
        <CupForecastSection fold={foldFor(sections, "cup-forecast")} forecast={cupForecast} />
      )}
      {!isGroupsAndPlayoff && <StandingsLegend />}
      {analytics}
    </PageShell>
  );
}
